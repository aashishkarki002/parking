from rest_framework import serializers
from .models import (
    ParkingConfiguration, PricingPlan, VehicleType, Vendor, Staff, Coupon,
    # --- ADD CouponBatch to imports ---
    ParkingPass, ParkingSession, CouponBatch
)


# ... (ParkingConfigurationSerializer, PricingPlanSerializer, VehicleTypeSerializer, VendorSerializer, StaffSerializer - NO CHANGES) ...

class ParkingConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParkingConfiguration
        fields = ['id', 'currency_symbol', 'company_name']
        read_only_fields = ['id']


class PricingPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = PricingPlan
        fields = ['id', 'name', 'plan_type', 'rate_details', 'minimum_charge']


class VehicleTypeSerializer(serializers.ModelSerializer):
    pricing_plan = serializers.StringRelatedField()
    pricing_plan_id = serializers.PrimaryKeyRelatedField(
        queryset=PricingPlan.objects.all(), source='pricing_plan', write_only=True
    )

    class Meta:
        model = VehicleType
        fields = ['id', 'name', 'pricing_plan', 'pricing_plan_id', 'free_duration_minutes']


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = ['id', 'name', 'location', 'contact_person', 'contact_email', 'created_at', 'updated_at']


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
        fields = ['id', 'name', 'company', 'company_id', 'license_plate', 'vehicle_type', 'vehicle_type_id', 'card_code']
        read_only_fields = ['card_code']


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
    # ... (NO CHANGES to this serializer) ...
    staff = serializers.StringRelatedField()
    staff_id = serializers.PrimaryKeyRelatedField(
        queryset=Staff.objects.all(), source='staff', write_only=True
    )

    class Meta:
        model = ParkingPass
        fields = ['id', 'staff', 'staff_id', 'valid_from', 'valid_until', 'price_paid', 'is_active', 'notes']


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

    class Meta:
        model = ParkingSession
        fields = [
            'id', 'ticket_number', 'vehicle_type', 'vehicle_type_id', 'license_plate',
            'registered_staff_member', 'entry_time', 'exit_time',
            'duration_minutes', 'applied_coupon', 'applied_pass',
            'calculated_charge', 'payment_method', 'status', 'notes',
            'undiscounted_charge', 'discount_value', 'charge_after_discount'
        ]
        read_only_fields = [
            'id', 'ticket_number', 'registered_staff_member', 'duration_minutes',
            'applied_pass', 'calculated_charge', 'status', 'entry_time'
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