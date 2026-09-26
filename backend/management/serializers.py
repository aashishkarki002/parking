import re
from decimal import Decimal

from django.contrib.auth.models import Group
from rest_framework import serializers
from .models import (
    ParkingConfiguration, PricingPlan, VehicleType, Vendor, Staff, Coupon,
    # --- ADD CouponBatch to imports ---
    ParkingPass, ParkingSession, CouponBatch, TicketStamp, TenantBill, RFIDCard
)
from user_app.models import User
from user_app.roles import ADMIN, ALL_ROLES, POS, SUPERADMIN


# ... (ParkingConfigurationSerializer, PricingPlanSerializer, VehicleTypeSerializer, VendorSerializer, StaffSerializer - NO CHANGES) ...

class ParkingConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParkingConfiguration
        fields = [
            'id', 'currency_symbol', 'company_name',
            'tenant_allowance_enabled', 'tenant_free_hours', 'tenant_lookback_hours',
            'night_pricing_enabled', 'night_start', 'night_end',
        ]
        read_only_fields = ['id']

    def validate(self, data):
        free = data.get('tenant_free_hours', getattr(self.instance, 'tenant_free_hours', None))
        lookback = data.get('tenant_lookback_hours', getattr(self.instance, 'tenant_lookback_hours', None))
        if free is not None and lookback is not None and free >= lookback:
            raise serializers.ValidationError(
                {'tenant_free_hours': 'Must be less than tenant_lookback_hours.'})
        night_start = data.get('night_start', getattr(self.instance, 'night_start', None))
        night_end = data.get('night_end', getattr(self.instance, 'night_end', None))
        if night_start is not None and night_start == night_end:
            raise serializers.ValidationError(
                {'night_end': 'Must differ from night_start.'})
        return data


class PricingPlanSerializer(serializers.ModelSerializer):
    night_rate_per_hour = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=Decimal('0'), required=False)

    class Meta:
        model = PricingPlan
        fields = ['id', 'name', 'plan_type', 'rate_details', 'minimum_charge', 'night_rate_per_hour']


class VehicleTypeSerializer(serializers.ModelSerializer):
    # `pricing_plan` is PricingPlan.__str__ — "<name> (Min: <x>)", not the bare
    # name — so clients cannot match it back to a plan. `pricing_plan_id` is
    # readable as well as writable so they can join on the id instead.
    pricing_plan = serializers.StringRelatedField()
    pricing_plan_id = serializers.PrimaryKeyRelatedField(
        queryset=PricingPlan.objects.all(), source='pricing_plan'
    )

    class Meta:
        model = VehicleType
        fields = ['id', 'name', 'pricing_plan', 'pricing_plan_id', 'free_duration_minutes', 'category']


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = [
            'id', 'name', 'location', 'contact_person', 'contact_email', 'created_at', 'updated_at',
            'external_tenant_id', 'car_quota', 'bike_quota', 'gate_access_allowed', 'last_synced_at', 'sync_source',
            'stamp_free_minutes',
        ]
        # EasyManage is the source of truth for these — Django only caches them
        # (via the webhook receiver / reconcile_parking_tenants). Still editable
        # via Django admin for manual override, which bypasses this serializer.
        read_only_fields = [
            'external_tenant_id', 'car_quota', 'bike_quota', 'gate_access_allowed', 'last_synced_at', 'sync_source',
        ]


class RFIDCardSerializer(serializers.ModelSerializer):
    """Read shape of a card, and the only thing that can be changed on an
    existing one: is_active (block a lost card at the gate). Re-assigning a
    card to another member stays in the admin."""

    class Meta:
        model = RFIDCard
        fields = ['id', 'uid', 'is_active', 'created_at']
        read_only_fields = ['uid', 'created_at']


class RFIDCardCreateSerializer(serializers.ModelSerializer):
    """Issue a card to a member: the UID the booth reader types, plus who it
    belongs to. New cards start active."""

    class Meta:
        model = RFIDCard
        fields = ['id', 'uid', 'staff', 'is_active', 'created_at']
        read_only_fields = ['is_active', 'created_at']
        # The model's unique constraint would answer "rfid card with this uid
        # already exists"; validate_uid says who holds it instead. The DB
        # constraint stays as the backstop (see RFIDCardViewSet.create).
        extra_kwargs = {'uid': {'validators': []}}

    def validate_uid(self, value):
        if not re.fullmatch(r'[0-9A-Za-z]+', value):
            raise serializers.ValidationError('A card number has only letters and digits, no spaces.')
        holder = RFIDCard.objects.select_related('staff').filter(uid=value).first()
        if holder is not None:
            raise serializers.ValidationError(
                f'This card is already assigned to {holder.staff.name} ({holder.staff.license_plate}).')
        return value


class StaffSerializer(serializers.ModelSerializer):
    company = serializers.StringRelatedField()
    company_id = serializers.PrimaryKeyRelatedField(
        queryset=Vendor.objects.all(), source='company', write_only=True, required=False, allow_null=True
    )
    vehicle_type = serializers.StringRelatedField()
    vehicle_type_id = serializers.PrimaryKeyRelatedField(
        queryset=VehicleType.objects.all(), source='vehicle_type', write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = Staff
        fields = [
            'id', 'name', 'company', 'company_id', 'license_plate', 'vehicle_type', 'vehicle_type_id',
            'card_code', 'is_card_active',
        ]
        read_only_fields = ['card_code']

    def validate(self, data):
        vendor = data.get('company', getattr(self.instance, 'company', None))
        vehicle_type = data.get('vehicle_type', getattr(self.instance, 'vehicle_type', None))

        if vendor is None or vehicle_type is None:
            return data

        quota = vendor.car_quota if vehicle_type.category == 'CAR' else vendor.bike_quota

        existing_count = Staff.objects.filter(
            company=vendor, vehicle_type__category=vehicle_type.category
        )
        if self.instance is not None:
            existing_count = existing_count.exclude(pk=self.instance.pk)
        existing_count = existing_count.count()

        if existing_count + 1 > quota:
            category_label = 'car' if vehicle_type.category == 'CAR' else 'bike'
            raise serializers.ValidationError({
                'vehicle_type_id': (
                    f"{vendor.name} has no remaining {category_label} parking quota "
                    f"({existing_count}/{quota} slots used)."
                )
            })

        return data


class StaffWithCardsSerializer(StaffSerializer):
    """The /staff endpoint's shape: StaffSerializer plus the member's RFID
    cards. Kept off StaffSerializer itself because ParkingPassSerializer nests
    that one, and passes have no use for card UIDs (or the extra query per
    vehicle). Newest card first (RFIDCard.Meta.ordering)."""
    rfid_cards = RFIDCardSerializer(many=True, read_only=True)

    class Meta(StaffSerializer.Meta):
        fields = StaffSerializer.Meta.fields + ['rfid_cards']


# --- MODIFIED CouponSerializer ---
class CouponSerializer(serializers.ModelSerializer):
    is_currently_valid = serializers.SerializerMethodField()
    issued_by = serializers.StringRelatedField()
    # Add batch as a read-only field. It's a link to the parent batch.
    batch = serializers.PrimaryKeyRelatedField(read_only=True)

    def get_is_currently_valid(self, obj):
        is_valid, _ = obj.is_valid()
        return is_valid

    class Meta:
        model = Coupon
        fields = [
            'id', 'code',
            'batch',  # <-- ADDED
            'validation_type', 'value_minutes', 'issued_by',
            'price', 'is_active', 'valid_from', 'valid_until', 'max_uses',
            'times_used', 'is_currently_valid'
        ]
        read_only_fields = ['times_used', 'is_currently_valid']


class ParkingPassSerializer(serializers.ModelSerializer):
    staff = StaffSerializer(read_only=True)
    staff_id = serializers.PrimaryKeyRelatedField(
        queryset=Staff.objects.all(), source='staff', write_only=True
    )
    extra_vehicles = StaffSerializer(many=True, read_only=True)
    extra_vehicle_ids = serializers.PrimaryKeyRelatedField(
        queryset=Staff.objects.all(), source='extra_vehicles', write_only=True, many=True, required=False
    )

    class Meta:
        model = ParkingPass
        fields = [
            'id', 'staff', 'staff_id', 'extra_vehicles', 'extra_vehicle_ids',
            'valid_from', 'valid_until', 'price_paid', 'payment_method', 'reminder_enabled',
            'is_active', 'notes',
        ]

    def validate_extra_vehicle_ids(self, vehicles):
        staff = self.initial_data.get('staff_id')
        if staff is not None and any(str(v.pk) == str(staff) for v in vehicles):
            raise serializers.ValidationError('The primary staff member cannot also be listed as an extra vehicle.')
        return vehicles


class TicketStampSerializer(serializers.ModelSerializer):
    vendor = serializers.StringRelatedField(read_only=True)
    vendor_id = serializers.PrimaryKeyRelatedField(
        queryset=Vendor.objects.all(), source='vendor', write_only=True
    )

    class Meta:
        model = TicketStamp
        fields = ['id', 'vendor', 'vendor_id', 'free_minutes_granted', 'stamped_at']
        read_only_fields = ['id', 'free_minutes_granted', 'stamped_at']


class TenantBillSerializer(serializers.ModelSerializer):
    vendor = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = TenantBill
        fields = ['id', 'vendor', 'overage_minutes', 'amount', 'created_at']
        read_only_fields = fields


class ParkingSessionSerializer(serializers.ModelSerializer):
    # ... (NO CHANGES to this serializer) ...
    vehicle_type = serializers.StringRelatedField(read_only=True)
    registered_staff_member = serializers.StringRelatedField(read_only=True)
    applied_coupon = serializers.StringRelatedField(read_only=True)
    applied_pass = serializers.StringRelatedField(read_only=True)
    vehicle_type_id = serializers.PrimaryKeyRelatedField(
        queryset=VehicleType.objects.all(), source='vehicle_type', write_only=True
    )
    undiscounted_charge = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)
    discount_value = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)
    charge_after_discount = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True, allow_null=True)
    stamps = TicketStampSerializer(many=True, read_only=True)
    total_stamp_minutes = serializers.IntegerField(read_only=True)
    tenant_bill = TenantBillSerializer(read_only=True)

    class Meta:
        model = ParkingSession
        fields = [
            'id', 'ticket_number', 'vehicle_type', 'vehicle_type_id', 'license_plate',
            'registered_staff_member', 'entry_time', 'exit_time',
            'duration_minutes', 'applied_coupon', 'applied_pass',
            'calculated_charge', 'payment_method', 'status', 'notes',
            'undiscounted_charge', 'discount_value', 'charge_after_discount',
            'stamps', 'total_stamp_minutes', 'tenant_bill', 'auto_closed',
        ]
        read_only_fields = [
            'id', 'ticket_number', 'registered_staff_member', 'duration_minutes',
            'applied_pass', 'calculated_charge', 'status', 'entry_time', 'auto_closed'
        ]


# --- NEW CouponBatchSerializer ---
class CouponBatchSerializer(serializers.ModelSerializer):
    # For readable GET requests
    vendor = serializers.StringRelatedField(read_only=True)

    # For writeable POST requests
    vendor_id = serializers.PrimaryKeyRelatedField(
        queryset=Vendor.objects.all(), source='vendor', write_only=True
    )

    # For showing the generated coupons on GET requests (detail view)
    # We can REUSE your existing CouponSerializer here for a rich, detailed output.
    coupons = CouponSerializer(many=True, read_only=True)

    class Meta:
        model = CouponBatch
        fields = [
            'id', 'vendor', 'vendor_id', 'purchase_date',
            'validation_type', 'value_minutes', 'valid_from', 'valid_until',
            'number_of_coupons', 'base_price_per_coupon',
            'total_price', 'is_paid', 'payment_method', 'notes',
            'coupons'  # This is the nested list of generated coupons
        ]
        # These fields are calculated by the model or set automatically
        read_only_fields = ['id', 'purchase_date', 'total_price', 'coupons']

    def validate(self, data):
        """
        Custom validation to ensure payment_method is set if is_paid is True.
        """
        is_paid = data.get('is_paid', False)
        payment_method = data.get('payment_method', None)
        if is_paid and not payment_method:
            raise serializers.ValidationError({
                "payment_method": "This field is required when the batch is marked as paid."
            })
        return data


class OperatorSerializer(serializers.ModelSerializer):
    """Login accounts for desk staff (pos/admin/superadmin Django Groups).

    A user holds exactly one of the three roles here — they're escalating
    tiers (see management/permissions.py), not independent grants — so
    `role` is a single write-only choice and the read side (`to_representation`)
    reports back whichever tier the account's groups currently resolve to.
    """
    role = serializers.ChoiceField(choices=[(r, r) for r in ALL_ROLES], write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)

    class Meta:
        model = User
        fields = ['id', 'email', 'phone_no', 'is_active', 'role', 'password', 'date_joined']
        read_only_fields = ['id', 'date_joined']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # is_superuser is Django's own "bypasses every check" flag — treated as
        # an automatic superadmin everywhere else (user_has_role), so it's
        # reported as one here too rather than showing "No role" for an
        # account whose access doesn't actually come from a group.
        if instance.is_superuser:
            data['role'] = SUPERADMIN
        else:
            group_names = set(instance.groups.values_list('name', flat=True))
            # Highest tier first: an account seeded with more than one group
            # (e.g. via the admin site) still reports as a single role.
            data['role'] = next((r for r in (SUPERADMIN, ADMIN, POS) if r in group_names), None)
        return data

    def validate_email(self, value):
        return value.strip().lower()

    def validate_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError('Password must be at least 8 characters.')
        return value

    def validate(self, data):
        request = self.context.get('request')
        if self.instance is None:
            if not data.get('password'):
                raise serializers.ValidationError({'password': 'Password is required.'})
            if not data.get('role'):
                raise serializers.ValidationError({'role': 'Select a role.'})
        else:
            acting_user = getattr(request, 'user', None)
            if acting_user and acting_user.pk == self.instance.pk:
                role = data.get('role')
                if role is not None and role != SUPERADMIN:
                    raise serializers.ValidationError("You can't remove your own superadmin role.")
                if data.get('is_active') is False:
                    raise serializers.ValidationError("You can't deactivate your own account.")
        return data

    def create(self, validated_data):
        role = validated_data.pop('role')
        password = validated_data.pop('password')
        user = User.objects.create_user(
            email=validated_data.pop('email'), password=password, **validated_data
        )
        user.groups.set([Group.objects.get(name=role)])
        return user

    def update(self, instance, validated_data):
        role = validated_data.pop('role', None)
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        if role:
            instance.groups.set([Group.objects.get(name=role)])
        return instance