# parking_management/models.py

import calendar
import math
import uuid
import hmac
import hashlib
import struct
import time
from datetime import datetime, timedelta, time as time_of_day
from decimal import Decimal
import qrcode
import io
import base64
from django.urls import reverse

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models, transaction
from django.db.models import F, Sum
from django.utils import timezone

# --- Foundational Models ---


class ParkingConfiguration(models.Model):
    id = models.PositiveSmallIntegerField(
        primary_key=True, default=1, editable=False)
    currency_symbol = models.CharField(max_length=5, default='NRs')
    company_name = models.CharField(
        max_length=100, blank=True, default="Django Parking Inc.")

    # --- Tenant free-parking allowance ---
    # Every registered tenant vehicle (pass holder or not) parks free for the
    # day hours inside tenant_free_hours from entry. Re-entering inside that
    # window shares it, so exiting and coming back never restarts the clock.
    # Night hours and day hours past the window are billed at the vehicle's
    # pricing plan. See ParkingSession._apply_tenant_allowance_billing.
    tenant_allowance_enabled = models.BooleanField(
        default=True,
        help_text="When on, registered tenant vehicles park free only up to the allowance "
                   "below; time past it is billed normally. When off, pass holders park "
                   "free without limit and other tenants are billed like visitors."
    )
    tenant_free_hours = models.PositiveSmallIntegerField(
        default=12,
        help_text="Hours from entry that registered vehicles park free (day hours only). "
                   "Re-entering inside this window doesn't restart it."
    )
    tenant_lookback_hours = models.PositiveSmallIntegerField(
        default=24,
        help_text="Not used by billing any more; the free window runs from entry."
    )

    # Flat amount charged instead of the parking fee when a ticket is lost —
    # see ParkingSession.mark_lost.
    lost_ticket_fine = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal('100.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Charged in place of the parking fee when a customer loses their ticket."
    )

    # --- Night pricing ---
    # Minutes inside [night_start, night_end) (local time, may wrap past
    # midnight) are billed at the plan's night_rate_per_hour instead of its
    # day pricing — for everyone, tenants and pass holders included. See
    # ParkingSession._split_day_night.
    night_pricing_enabled = models.BooleanField(
        default=True,
        help_text="When on, time parked inside the night window is billed at each "
                   "pricing plan's night rate."
    )
    night_start = models.TimeField(default=time_of_day(22, 0))
    night_end = models.TimeField(default=time_of_day(6, 0))
    # Registered vehicles only: a stay that crosses a night boundary by no
    # more than these minutes isn't billed for them — arriving just before
    # night_end, or leaving just after night_start. See
    # ParkingSession._boundary_grace_night_minutes.
    night_morning_grace_minutes = models.PositiveIntegerField(
        default=15,
        help_text="Registered vehicles arriving this many minutes or less before night end "
                  "(e.g. 05:45 for a 06:00 end) aren't charged for those night minutes."
    )
    night_evening_grace_minutes = models.PositiveIntegerField(
        default=15,
        help_text="Registered vehicles leaving this many minutes or less after night start "
                  "(e.g. 22:15 for a 22:00 start) aren't charged for those night minutes."
    )

    # --- Students ---
    # An approved, active student (see Student.active_for_plate) parks free
    # only inside their class window on a class day (Student.free_window);
    # time outside it is billed like a visitor.
    # Defaults for tenants that leave their own grace minutes blank.
    student_early_grace_minutes = models.PositiveIntegerField(
        default=15,
        help_text="Default free minutes before class start (arriving early), for tenants "
                  "without their own Vendor.student_early_grace_minutes."
    )
    student_late_grace_minutes = models.PositiveIntegerField(
        default=15,
        help_text="Default free minutes after class end (leaving late), for tenants "
                  "without their own Vendor.student_late_grace_minutes."
    )

    def __str__(self): return "Parking System Global Configuration"
    def save(self, *args, **kwargs): self.pk = 1; super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls): obj, created = cls.objects.get_or_create(
        pk=1); return obj

    class Meta:
        verbose_name = "Parking System Configuration"


class PricingPlan(models.Model):
    PLAN_TYPE_CHOICES = [('HOURLY', 'Hourly Rate'), ('FLAT_RATE_PER_DAY',
                                                     'Flat Rate Per Day'), ('TIERED_HOURLY', 'Tiered Hourly Blocks')]
    name = models.CharField(max_length=100, unique=True)
    plan_type = models.CharField(
        max_length=20, choices=PLAN_TYPE_CHOICES, default='HOURLY')
    rate_details = models.JSONField(default=dict)

    # NEW: Field for minimum charge
    minimum_charge = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal('0.00'),
        help_text="The minimum fee for this plan, if the calculated charge is > 0. Set to 0 for no minimum."
    )
    night_rate_per_hour = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal('0.00'),
        help_text="Hourly rate for time inside the night window (ParkingConfiguration). "
                   "0 means night time is billed like day time."
    )
    is_sample = models.BooleanField(
        default=False, db_index=True,
        help_text="True if this record was generated by seed_parking_data. Never set manually."
    )

    def __str__(self): return f"{self.name} (Min: {self.minimum_charge})"

    class Meta:
        verbose_name = "Pricing Plan"
        verbose_name_plural = "Pricing Plans"


class VehicleType(models.Model):
    CATEGORY_CHOICES = [('CAR', 'Car'), ('BIKE', 'Bike')]

    name = models.CharField(max_length=50, unique=True)
    pricing_plan = models.ForeignKey(
        PricingPlan, on_delete=models.PROTECT, null=True)
    free_duration_minutes = models.PositiveIntegerField(default=5)
    # Drives quota enforcement against Vendor.car_quota/bike_quota — see
    # StaffSerializer.validate(). Only two categories exist today; extend
    # later if a third (e.g. e-bike) appears.
    category = models.CharField(
        max_length=10, choices=CATEGORY_CHOICES, default='CAR')
    is_sample = models.BooleanField(
        default=False, db_index=True,
        help_text="True if this record was generated by seed_parking_data. Never set manually."
    )

    def __str__(self):
        # return f"{self.name} (Free: {self.free_duration_minutes}min)"
        return f"{self.name}"

    class Meta:
        verbose_name = "Vehicle Type"
        ordering = ['name']


class Vendor(models.Model):
    SYNC_SOURCE_CHOICES = [
        ('webhook', 'Webhook'),
        ('pull', 'Pull Reconcile'),
        ('manual', 'Manual'),
    ]

    name = models.CharField(max_length=150, unique=True)
    location = models.CharField(max_length=200, blank=True)
    contact_person = models.CharField(max_length=100, blank=True)
    contact_email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_sample = models.BooleanField(
        default=False, db_index=True,
        help_text="True if this record was generated by seed_parking_data. Never set manually."
    )

    # --- EasyManage sync cache (Sallyan House gate integration) ---
    # EasyManage is the source of truth for these fields; Django only caches
    # them so the gate scanner never depends on a live call. Updated via
    # webhook (sync_vendor_from_payload) or the nightly reconcile_parking_tenants
    # command — never derived locally.
    external_tenant_id = models.CharField(
        max_length=64, unique=True, null=True, blank=True, db_index=True)
    car_quota = models.PositiveIntegerField(default=0)
    bike_quota = models.PositiveIntegerField(default=0)
    gate_access_allowed = models.BooleanField(default=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    sync_source = models.CharField(
        max_length=20, choices=SYNC_SOURCE_CHOICES, null=True, blank=True)

    # --- Ticket stamping ---
    # A tenant physically stamps a visitor's parking chit; the gate operator
    # records that stamp against the visitor's ParkingSession (see
    # TicketStamp / ParkingSession.add_stamp) instead of waving them through
    # as a cash payment. This is how many free minutes each stamp is worth.
    stamp_free_minutes = models.PositiveIntegerField(
        default=60,
        help_text="Free parking minutes granted each time this tenant stamps a visitor's ticket."
    )

    # --- Students ---
    # A student parks free from class start minus the early grace to class
    # end plus the late grace (Student.free_window).
    student_early_grace_minutes = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Free minutes before class start for this tenant's students. "
                  "Blank uses the global default (Parking Configuration)."
    )
    student_late_grace_minutes = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Free minutes after class end for this tenant's students. "
                  "Blank uses the global default (Parking Configuration)."
    )

    # --- Tenant free-parking allowance ---
    # Overrides ParkingConfiguration.tenant_free_hours for this tenant's
    # registered vehicles (see ParkingSession._apply_tenant_allowance_billing).
    tenant_free_hours = models.PositiveSmallIntegerField(
        null=True, blank=True,
        help_text="Hours from entry that this tenant's registered vehicles park free (day hours only). "
                  "Blank uses the global default (Parking Configuration)."
    )

    @property
    def effective_tenant_free_hours(self):
        """Free-window hours for this tenant, falling back to the global default."""
        if self.tenant_free_hours is not None:
            return self.tenant_free_hours
        return ParkingConfiguration.get_solo().tenant_free_hours

    @property
    def effective_student_grace_minutes(self):
        """(early, late) grace minutes, falling back to the global defaults."""
        config = ParkingConfiguration.get_solo()
        early, late = self.student_early_grace_minutes, self.student_late_grace_minutes
        return (config.student_early_grace_minutes if early is None else early,
                config.student_late_grace_minutes if late is None else late)

    def __str__(self): return self.name

    class Meta:
        verbose_name = "Vendor / Tenant"
        ordering = ['name']


class Staff(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField(null=True, blank=True)
    company = models.ForeignKey(
        Vendor, on_delete=models.SET_NULL, null=True, blank=True)
    license_plate = models.CharField(max_length=20, unique=True, db_index=True)
    vehicle_type = models.ForeignKey(
        VehicleType, on_delete=models.SET_NULL, null=True, blank=True)
    card_code = models.UUIDField(
        default=uuid.uuid4, editable=False, unique=True, db_index=True,
        help_text="Encoded on the tenant's permanent physical parking card (QR/barcode). "
                   "Never rotates — regenerate via admin action if the physical card is lost."
    )
    is_card_active = models.BooleanField(
        default=True,
        help_text="Uncheck to instantly block this card at the gate (lost/leaked) without losing history."
    )
    card_issued_at = models.DateTimeField(default=timezone.now)
    is_sample = models.BooleanField(
        default=False, db_index=True,
        help_text="True if this record was generated by seed_parking_data. Never set manually."
    )

    DIGITAL_TOKEN_SALT = 'tenant-card-digital'
    DIGITAL_TOKEN_MAX_AGE = 60  # seconds a digital QR stays valid before the app must refresh it

    @staticmethod
    def _qr_base64(data):
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode()

    def generate_card_qr_code(self):
        """Static QR for the permanent physical card — encodes the raw card_code."""
        return self._qr_base64(str(self.card_code))

    def generate_digital_token(self):
        """Short-lived signed token for the digital card view. Expires in
        DIGITAL_TOKEN_MAX_AGE seconds, so a screenshot goes stale fast."""
        from django.core.signing import TimestampSigner
        signer = TimestampSigner(salt=self.DIGITAL_TOKEN_SALT)
        return signer.sign(str(self.card_code))

    def generate_digital_qr_code(self):
        return self._qr_base64(self.generate_digital_token())

    # --- Offline mode: TOTP-style rotating code, verifiable with zero network
    # calls at scan time. Trade-off vs. the online token: the per-card secret
    # is delivered to the client once (at page load) so it can keep computing
    # fresh codes with no connectivity — meaning anyone who extracts that
    # secret from the page can also generate future codes offline. Only use
    # this path when the tenant genuinely has no signal at the gate; the
    # online signed-token mode above is strictly more secure and should stay
    # the default whenever a network call is possible.
    OFFLINE_SECRET_SALT = 'tenant-card-offline'
    OFFLINE_TOTP_STEP_SECONDS = 30
    OFFLINE_TOTP_DIGITS = 6
    OFFLINE_TOTP_DRIFT_STEPS = 2  # tolerate up to ~1 min of clock drift/scan delay either side

    def _offline_secret_bytes(self):
        from django.conf import settings
        msg = f"{self.OFFLINE_SECRET_SALT}:{self.card_code}".encode()
        return hmac.new(settings.SECRET_KEY.encode(), msg, hashlib.sha256).digest()

    def offline_secret_hex(self):
        """Delivered to the client once so it can compute rotating codes offline."""
        return self._offline_secret_bytes().hex()

    @classmethod
    def _totp_at_step(cls, secret_bytes, step):
        msg = struct.pack('>Q', step)
        digest = hmac.new(secret_bytes, msg, hashlib.sha1).digest()
        offset = digest[-1] & 0x0F
        code_int = (struct.unpack('>I', digest[offset:offset + 4])[0] & 0x7FFFFFFF) % (10 ** cls.OFFLINE_TOTP_DIGITS)
        return str(code_int).zfill(cls.OFFLINE_TOTP_DIGITS)

    def current_offline_code(self):
        step = int(time.time() // self.OFFLINE_TOTP_STEP_SECONDS)
        return self._totp_at_step(self._offline_secret_bytes(), step)

    def generate_offline_qr_payload(self):
        return f"{self.card_code}#{self.current_offline_code()}"

    def generate_offline_qr_code(self):
        return self._qr_base64(self.generate_offline_qr_payload())

    def verify_offline_code(self, code):
        secret = self._offline_secret_bytes()
        current_step = int(time.time() // self.OFFLINE_TOTP_STEP_SECONDS)
        return any(
            self._totp_at_step(secret, current_step + drift) == code
            for drift in range(-self.OFFLINE_TOTP_DRIFT_STEPS, self.OFFLINE_TOTP_DRIFT_STEPS + 1)
        )

    @classmethod
    def resolve_scanned_code(cls, raw_value):
        """
        Accepts a raw card_code UUID (physical card), a signed digital token
        (online digital card), or a "<card_code>#<totp>" offline code.
        Returns the underlying card_code string, or None if invalid/expired.
        """
        from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

        if '#' in raw_value:
            card_code_str, _, code = raw_value.partition('#')
            try:
                staff = cls.objects.get(card_code=card_code_str)
            except (cls.DoesNotExist, ValueError, ValidationError):
                return None
            return card_code_str if staff.verify_offline_code(code) else None

        if ':' in raw_value:
            signer = TimestampSigner(salt=cls.DIGITAL_TOKEN_SALT)
            try:
                return signer.unsign(raw_value, max_age=cls.DIGITAL_TOKEN_MAX_AGE)
            except (BadSignature, SignatureExpired):
                return None

        return raw_value

    def __str__(self): return f"{self.name} - {self.license_plate}"

    class Meta:
        verbose_name = "Tenant Member"
        verbose_name_plural = "Tenant Members"
        ordering = ['name']


class Coupon(models.Model):
    VALIDATION_TYPE_CHOICES = [
        ('FREE_MINUTES', 'Grant Free Minutes'), ('COMPLETE_WAIVER', 'Waive Entire Session')]
    code = models.CharField(max_length=30, unique=True, db_index=True)
    validation_type = models.CharField(
        max_length=20, choices=VALIDATION_TYPE_CHOICES)
    value_minutes = models.PositiveIntegerField(default=0)
    issued_by = models.ForeignKey(
        Vendor, on_delete=models.SET_NULL, null=True, blank=True)
    price = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal('0.00'))
    is_active = models.BooleanField(default=True)
    valid_from = models.DateTimeField(null=True, blank=True)
    valid_until = models.DateTimeField(null=True, blank=True)
    max_uses = models.PositiveIntegerField(default=1)
    times_used = models.PositiveIntegerField(default=0, editable=False)

    batch = models.ForeignKey(
        'CouponBatch',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="coupons",
        help_text="The batch this coupon was generated from, if any."
    )
    is_sample = models.BooleanField(
        default=False, db_index=True,
        help_text="True if this record was generated by seed_parking_data. Never set manually."
    )

    def is_valid(self):
        if not self.is_active:
            return False, "Coupon is not active."
        now = timezone.now()
        if self.valid_from and self.valid_from > now:
            return False, "Coupon is not yet valid."
        if self.valid_until and self.valid_until < now:
            return False, "Coupon has expired."
        if self.max_uses is not None and self.times_used >= self.max_uses:
            return False, "Coupon has been used to its limit."
        return True, "Coupon is valid."

    def __str__(
            self):
        return f"Coupon {self.code} ({self.get_validation_type_display()})"

    class Meta:
        verbose_name = "Parking Coupon"
        verbose_name_plural = "Parking Coupons"


class CouponBatch(models.Model):
    """
    Represents a bulk purchase of coupons by a vendor.
    Creating or saving this model will generate the individual Coupon objects.
    """
    PAYMENT_METHOD_CHOICES = [
        ('CASH', 'Cash'), ('ONLINE_PAYMENT', 'Online Payment')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="coupon_batches")
    purchase_date = models.DateTimeField(default=timezone.now)

    # --- Coupon Template Details ---
    # These fields define what kind of coupons will be generated.
    validation_type = models.CharField(max_length=20, choices=Coupon.VALIDATION_TYPE_CHOICES)
    value_minutes = models.PositiveIntegerField(default=0, help_text="For 'Grant Free Minutes' coupons.")
    valid_from = models.DateTimeField(null=True, blank=True)
    valid_until = models.DateTimeField(null=True, blank=True)

    # --- Purchase Details ---
    number_of_coupons = models.PositiveIntegerField(default=10)
    base_price_per_coupon = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('0.00'))
    total_price = models.DecimalField(max_digits=10, decimal_places=2, editable=False)
    is_paid = models.BooleanField(default=False)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, null=True, blank=True)
    notes = models.TextField(blank=True, help_text="Internal notes about this batch purchase.")
    is_sample = models.BooleanField(
        default=False, db_index=True,
        help_text="True if this record was generated by seed_parking_data. Never set manually."
    )

    def __str__(self):
        return f"{self.vendor.name} ({self.number_of_coupons} coupons) on {self.purchase_date.strftime('%Y-%m-%d')}"

    def clean(self):
        # Calculate total price before validation
        self.total_price = self.base_price_per_coupon * self.number_of_coupons
        if self.is_paid and not self.payment_method:
            raise ValidationError("A payment method is required if the batch is marked as paid.")

    def save(self, *args, **kwargs):
        self.full_clean()  # Run validation and calculate total price

        # Check if this is a new, unsaved batch
        is_new = self._state.adding

        super().save(*args, **kwargs)  # Save the batch first to get a PK

        if is_new:
            # Use a transaction to ensure all coupons are created or none are.
            with transaction.atomic():
                coupons_to_create = []
                for i in range(self.number_of_coupons):
                    # Generate a unique, predictable code
                    # Format: BATCH-<BatchID_short>-<sequence>
                    code_sequence = str(i + 1).zfill(len(str(self.number_of_coupons)))
                    unique_code = f"B-{str(self.id)[:8].upper()}-{code_sequence}"

                    coupons_to_create.append(
                        Coupon(
                            batch=self,  # Link back to this batch
                            code=unique_code,
                            validation_type=self.validation_type,
                            value_minutes=self.value_minutes,
                            issued_by=self.vendor,
                            price=self.base_price_per_coupon,
                            is_active=True,  # New coupons are active by default
                            valid_from=self.valid_from,
                            valid_until=self.valid_until,
                            max_uses=1  # Typically one use per printed coupon
                        )
                    )
                Coupon.objects.bulk_create(coupons_to_create)

    class Meta:
        verbose_name = "Coupon Batch Purchase"
        verbose_name_plural = "Coupon Batch Purchases"
        ordering = ['-purchase_date']

def _add_months(dt, months):
    """dt moved forward by whole calendar months, clamped to the last day of
    the target month (Jan 31 + 1 month = Feb 28/29)."""
    month_index = dt.month - 1 + months
    year, month = dt.year + month_index // 12, month_index % 12 + 1
    return dt.replace(year=year, month=month, day=min(dt.day, calendar.monthrange(year, month)[1]))


class ParkingPass(models.Model):
    PAYMENT_METHOD_CHOICES = [
        ('CASH', 'Cash'),
        ('BANK_TRANSFER', 'Bank transfer'),
        ('CHEQUE', 'Cheque'),
        ('SALARY_DEDUCTION', 'Salary deduction'),
    ]

    staff = models.ForeignKey(
        Staff, on_delete=models.CASCADE, related_name="parking_passes",
        help_text="Primary pass holder. Additional vehicles covered by the same pass go in extra_vehicles."
    )
    extra_vehicles = models.ManyToManyField(
        Staff, related_name="parking_passes_covered", blank=True,
        help_text="Other vehicles covered by this same pass, besides the primary staff member above. "
                   "One price covers every vehicle listed — only one of them may be inside the lot at a time."
    )
    valid_from = models.DateTimeField()
    valid_until = models.DateTimeField()
    price_paid = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal('0.00'))
    payment_method = models.CharField(
        max_length=20, choices=PAYMENT_METHOD_CHOICES, default='CASH')
    reminder_enabled = models.BooleanField(
        default=False,
        help_text="Send a renewal reminder 7 days before this pass ends."
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    is_sample = models.BooleanField(
        default=False, db_index=True,
        help_text="True if this record was generated by seed_parking_data. Never set manually."
    )

    def is_valid_at(
            self, check_datetime): return self.is_active and self.valid_from <= check_datetime <= self.valid_until

    def covers_staff(self, staff):
        return staff is not None and (staff_id := staff.pk) is not None and (
            self.staff_id == staff_id or self.extra_vehicles.filter(pk=staff_id).exists()
        )

    def all_vehicles(self):
        """Primary staff member plus every extra vehicle covered by this pass."""
        return [self.staff, *self.extra_vehicles.all()]

    def generate_qr_code(self):
        # Create QR code data - includes staff ID and license plate
        qr_data = f"staff_id:{self.staff.id};license_plate:{self.staff.license_plate}"

        # Generate QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(qr_data)
        qr.make(fit=True)

        # Create image
        img = qr.make_image(fill_color="black", back_color="white")

        # Convert to base64 for embedding in HTML
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode()

    def __str__(
            self): return f"Pass for {self.staff.name} (until {self.valid_until.strftime('%Y-%m-%d')})"

    @classmethod
    def active_for_staff(cls, staff, at=None):
        """
        The subscription pass covering this vehicle right now (as primary
        holder or as one of a pass's extra_vehicles), or None. The single
        source of truth for "does this tenant have an active subscription"
        — the ticket flow and the RFID gate both go through here.
        """
        if staff is None:
            return None
        at = at or timezone.now()
        return cls.objects.filter(
            models.Q(staff=staff) | models.Q(extra_vehicles=staff),
            valid_from__lte=at,
            valid_until__gte=at,
            is_active=True,
        ).distinct().first()

    def renewal(self):
        """The active pass for the same holder that ends after this one, or
        None. Used to stop a pass being renewed twice."""
        return ParkingPass.objects.filter(
            staff_id=self.staff_id, is_active=True, valid_until__gt=self.valid_until,
        ).exclude(pk=self.pk).order_by('valid_until').first()

    @transaction.atomic
    def renew(self, now=None):
        """
        Create the next pass: same holder, extra vehicles, price and payment
        method, for the same number of calendar months (at least one). It
        starts where this one ends, or now if this one has already lapsed,
        so a late renewal doesn't pay for days that are already over. The
        holder's RFID cards need no change — the gate checks
        active_for_staff, so they work again as soon as this pass exists.
        """
        now = now or timezone.now()
        start = max(self.valid_until, now)
        months = max(1, round((self.valid_until - self.valid_from).days / 30))
        new_pass = ParkingPass.objects.create(
            staff=self.staff,
            valid_from=start,
            valid_until=_add_months(timezone.localtime(start), months),
            price_paid=self.price_paid,
            payment_method=self.payment_method,
            reminder_enabled=self.reminder_enabled,
        )
        new_pass.extra_vehicles.set(self.extra_vehicles.all())
        return new_pass

    class Meta:
        verbose_name = "Subscription Pass"
        verbose_name_plural = "Subscription Passes"
        ordering = ['-valid_until']


class RFIDCard(models.Model):
    """
    A 13.56MHz RFID card issued to a tenant member. The booth reader is a
    keyboard wedge that types only the card's UID, so the UID is the whole
    identity — every timestamp comes from the server. A member can hold
    several cards over time (lost/replaced); deactivate the old one rather
    than deleting it so its session history survives.
    """
    uid = models.CharField(
        max_length=32, unique=True, db_index=True,
        help_text="Digits the reader types when the card is tapped, e.g. 0012345678. "
                   "Leading zeros matter — copy it exactly."
    )
    staff = models.ForeignKey(
        Staff, on_delete=models.CASCADE, related_name='rfid_cards',
        verbose_name="Tenant member"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Uncheck to block this card at the gate (lost/returned) without losing history."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        self.uid = (self.uid or '').strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.uid} ({self.staff.name})"

    class Meta:
        verbose_name = "RFID Card"
        verbose_name_plural = "RFID Cards"
        ordering = ['-created_at']


def normalize_plate(value):
    """Vehicle numbers are matched without case or spaces, so 'ba 2 pa 1234'
    on a ticket finds the student registered as 'BA2PA1234'."""
    return ''.join((value or '').split()).upper()


class StudentRequest(models.Model):
    """
    One submission from a tenant's portal: a list of students, typed in or
    uploaded as a CSV/Excel sheet. Each row becomes a Student that an admin
    approves or rejects on its own; the request's status is derived from them.
    """
    SOURCE_CHOICES = [('MANUAL', 'Manual entry'), ('CSV', 'CSV file'), ('EXCEL', 'Excel file')]

    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='student_requests')
    submitted_by = models.ForeignKey(
        'user_app.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='student_requests')
    submitted_at = models.DateTimeField(auto_now_add=True, db_index=True)
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default='MANUAL')
    original_file = models.FileField(upload_to='student_requests/', null=True, blank=True)
    note = models.TextField(blank=True)

    @property
    def status(self):
        """PENDING until an admin has decided every row; PARTIAL while some
        are decided and some aren't; REVIEWED once none are pending."""
        statuses = {s.review_status for s in self.students.all()}
        if Student.PENDING not in statuses:
            return 'REVIEWED'
        return 'PARTIAL' if statuses - {Student.PENDING} else 'PENDING'

    def __str__(self):
        return f"{self.vendor.name} — {timezone.localtime(self.submitted_at):%Y-%m-%d %H:%M}"

    class Meta:
        verbose_name = "Student Request"
        ordering = ['-submitted_at']


class Student(models.Model):
    """
    A tenant's student, from one row of a StudentRequest. Once approved it is
    also the gate record: while active and inside its batch dates, a ticket
    with this vehicle number (or this student's QR card) parks free inside
    the class window of that day (see free_window).
    """
    PENDING, APPROVED, REJECTED = 'PENDING', 'APPROVED', 'REJECTED'
    REVIEW_STATUS_CHOICES = [(PENDING, 'Pending'), (APPROVED, 'Approved'), (REJECTED, 'Rejected')]
    DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

    # Printed on the student QR card. The prefix lets the POS tell it apart
    # from a tenant member's card (a bare UUID) and a ticket (TI…).
    CARD_PREFIX = 'ST-'

    request = models.ForeignKey(StudentRequest, on_delete=models.CASCADE, related_name='students')
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='students')
    sn = models.CharField("S.N.", max_length=20, blank=True)
    name = models.CharField(max_length=150)
    contact_number = models.CharField(max_length=30, blank=True)
    license_plate = models.CharField("Vehicle number", max_length=20, db_index=True)
    vehicle_type = models.ForeignKey(VehicleType, on_delete=models.SET_NULL, null=True, blank=True)
    batch_start_date = models.DateField(null=True, blank=True)
    batch_end_date = models.DateField(
        help_text="Last day the student parks free. The student stops matching at the gate after this.")
    class_days = models.JSONField(default=list, blank=True, help_text="e.g. [\"SUN\", \"MON\"]")
    class_time_from = models.TimeField(null=True, blank=True)
    class_time_to = models.TimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True, help_text="Inactive students are billed like visitors.")

    review_status = models.CharField(
        max_length=10, choices=REVIEW_STATUS_CHOICES, default=PENDING, db_index=True)
    reviewed_by = models.ForeignKey(
        'user_app.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reject_reason = models.CharField(max_length=255, blank=True)

    card_code = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        self.license_plate = normalize_plate(self.license_plate)
        super().save(*args, **kwargs)

    @classmethod
    def valid_q(cls, at=None):
        today = timezone.localdate(at) if at else timezone.localdate()
        return (
            models.Q(review_status=cls.APPROVED, is_active=True, batch_end_date__gte=today)
            & (models.Q(batch_start_date__isnull=True) | models.Q(batch_start_date__lte=today))
        )

    @classmethod
    def active_for_plate(cls, plate, at=None):
        """The approved, active student with this vehicle number whose batch
        covers `at` (default now), or None. The gate's single source of truth
        for "is this a student" — ticket exits and student cards both use it."""
        plate = normalize_plate(plate)
        if not plate:
            return None
        return (cls.objects.filter(cls.valid_q(at), license_plate=plate)
                .select_related('vendor').order_by('-batch_end_date').first())

    def is_valid_at(self, at=None):
        return type(self).objects.filter(self.valid_q(at), pk=self.pk).exists()

    def invalid_reason(self, at=None):
        """Why this student gets no free time right now, or '' if they do."""
        today = timezone.localdate(at) if at else timezone.localdate()
        if self.review_status != self.APPROVED:
            return f"Student is {self.get_review_status_display().lower()}, not approved."
        if not self.is_active:
            return "Student is marked inactive."
        if self.batch_start_date and self.batch_start_date > today:
            return f"Batch starts {self.batch_start_date:%Y-%m-%d}."
        if self.batch_end_date < today:
            return f"Batch ended {self.batch_end_date:%Y-%m-%d}."
        return ''

    def free_window(self, at):
        """(start, end) of free parking on the day of `at`: from the tenant's
        early grace before class start until its late grace after class end.
        None on a day that isn't a class day, or without both class times —
        then the student pays like a visitor (or gets stamped)."""
        if not (self.class_time_from and self.class_time_to):
            return None
        local = timezone.localtime(at)
        if self.DAYS[local.weekday()] not in (self.class_days or []):
            return None
        early, late = self.vendor.effective_student_grace_minutes
        on_day = lambda t: timezone.make_aware(datetime.combine(local.date(), t), local.tzinfo)  # noqa: E731
        return (on_day(self.class_time_from) - timedelta(minutes=early),
                on_day(self.class_time_to) + timedelta(minutes=late))

    @property
    def card_payload(self):
        return f"{self.CARD_PREFIX}{self.card_code}"

    def generate_card_qr_code(self):
        return Staff._qr_base64(self.card_payload)

    @classmethod
    def from_card_payload(cls, raw_value):
        raw_value = (raw_value or '').strip()
        if not raw_value.upper().startswith(cls.CARD_PREFIX):
            return None
        try:
            return cls.objects.select_related('vendor', 'vehicle_type').get(
                card_code=raw_value[len(cls.CARD_PREFIX):])
        except (cls.DoesNotExist, ValueError, ValidationError):
            return None

    def __str__(self):
        return f"{self.name} - {self.license_plate}"

    class Meta:
        verbose_name = "Student"
        ordering = ['request_id', 'id']


class ParkingSessionQuerySet(models.QuerySet):
    def valid(self):
        """
        Sessions whose timestamps are real. An auto_closed session's exit_time
        is when staff corrected a missed tap, not when the car left, so it
        must never feed a duration, usage or billing figure.
        """
        return self.exclude(auto_closed=True)


class ParkingSession(models.Model):
    # ... (Field definitions are correct) ...
    SESSION_STATUS_CHOICES = [('ACTIVE', 'Active'), ('COMPLETED', 'Completed'), (
        'PAID', 'Paid'), ('WAIVED', 'Waived'), ('COVERED_BY_PASS', 'Covered by Pass'),
        ('STAMPED', 'Stamped')]
    PAYMENT_METHOD_CHOICES = [
        ('CASH', 'Cash'), ('ONLINE_PAYMENT', 'Online Payment')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # <<< KEY FIELD DEFINITION >>>
    ticket_number = models.CharField(
        max_length=30,  # Increased length for safety
        unique=True,  # This is correct and necessary
        blank=True,  # Allows the field to be blank before we generate the value
        editable=False  # Hides it from forms (like the Admin)
    )

    vehicle_type = models.ForeignKey('VehicleType', on_delete=models.PROTECT)
    license_plate = models.CharField(
        max_length=20, db_index=True, blank=True, null=True)
    registered_staff_member = models.ForeignKey(
        'Staff', on_delete=models.SET_NULL, null=True, blank=True, related_name='parking_sessions', editable=False)
    entry_time = models.DateTimeField(default=timezone.now)
    exit_time = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(
        null=True, blank=True, editable=False)
    applied_coupon = models.ForeignKey(
        'Coupon', on_delete=models.SET_NULL, null=True, blank=True)
    applied_pass = models.ForeignKey(
        'ParkingPass', on_delete=models.SET_NULL, null=True, blank=True, editable=False)
    calculated_charge = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True)
    payment_method = models.CharField(
        max_length=20, choices=PAYMENT_METHOD_CHOICES, null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=SESSION_STATUS_CHOICES, default='ACTIVE', db_index=True)
    notes = models.TextField(blank=True)
    is_sample = models.BooleanField(
        default=False, db_index=True,
        help_text="True if this record was generated by seed_parking_data. Never set manually."
    )

    # --- RFID gate ---
    rfid_card = models.ForeignKey(
        RFIDCard, on_delete=models.PROTECT, null=True, blank=True,
        related_name='sessions', editable=False,
        help_text="The RFID card tapped to open this session, if any."
    )
    student = models.ForeignKey(
        Student, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='sessions', editable=False,
        help_text="Approved student matched by vehicle number or student card; "
                   "parks free inside their class window (Student.free_window)."
    )
    auto_closed = models.BooleanField(
        default=False, db_index=True, editable=False,
        help_text="Closed by a staff correction, not a real exit tap — exit_time is not when "
                   "the car left. Excluded from every duration/usage/billing figure "
                   "(ParkingSession.objects.valid())."
    )
    lost_ticket = models.BooleanField(
        default=False, editable=False,
        help_text="Closed at the POS as a lost ticket: charged the flat "
                   "ParkingConfiguration.lost_ticket_fine instead of the parking fee."
    )

    objects = ParkingSessionQuerySet.as_manager()

    class Meta:
        ordering = ['-entry_time']
        verbose_name = "Parking Session"
        constraints = [
            models.UniqueConstraint(
                fields=['rfid_card'],
                condition=models.Q(exit_time__isnull=True),
                name='one_open_session_per_rfid_card',
            ),
        ]

    def __str__(self):
        return f"Ticket #{self.ticket_number or 'N/A'} ({self.license_plate or 'No Plate'}) - {self.get_status_display()}"

    def _generate_ticket_number(self):
        # This logic is correct.
        today = timezone.now().date()
        today_str = today.strftime('%Y%m%d')
        prefix = f"TI{today_str}"
        last_ticket = ParkingSession.objects.filter(ticket_number__startswith=prefix).order_by('ticket_number').last()

        if not last_ticket:
            next_seq = 1
        else:
            try:
                last_seq_str = last_ticket.ticket_number.split('-')[-1]
                next_seq = int(last_seq_str) + 1
            except (ValueError, IndexError):
                count = ParkingSession.objects.filter(ticket_number__startswith=prefix).count()
                next_seq = count + 1

        return f"{prefix}-{str(next_seq).zfill(5)}"

    # <<< KEY METHOD >>>
    def save(self, *args, **kwargs):
        # Generate ticket number if it doesn't exist
        if not self.ticket_number:
            self.ticket_number = self._generate_ticket_number()

        # Rest of your save logic...
        if self.license_plate and not self.registered_staff_member_id:
            staff_obj = Staff.objects.filter(license_plate__iexact=self.license_plate).first()
            if staff_obj:
                self.registered_staff_member = staff_obj

        # A tenant's own vehicle is billed as one even if the plate is also
        # on a student list; otherwise match an approved student by plate.
        if self.registered_staff_member_id:
            self.student = None
        elif self.license_plate and not self.student_id:
            self.student = Student.active_for_plate(self.license_plate, at=self.entry_time)

        super().save(*args, **kwargs)

    def _round_charge_up_to_multiple(self, amount, multiple=Decimal('5')):
        if amount <= 0:
            return Decimal('0.00')
        return (Decimal(math.ceil(amount / multiple)) * multiple).quantize(Decimal('0.01'))

    def calculate_total_duration_minutes(self):
        effective_exit_time = self.exit_time or timezone.now()
        if self.entry_time > effective_exit_time:
            return 0
        return int((effective_exit_time - self.entry_time).total_seconds() / 60)

    def update_and_calculate_charges(self):
        if self.status in ['PAID', 'COVERED_BY_PASS'] or not self.exit_time:
            return
        # A staff-corrected close has no real exit time to bill against, and
        # a lost ticket is a flat fine (mark_lost) — never re-price either.
        if self.auto_closed or self.lost_ticket:
            return

        # Calculate duration if not set
        if not self.duration_minutes:
            self.duration_minutes = self.calculate_total_duration_minutes()

        # Registered tenant vehicles (pass holder or not) are billed against
        # the tenant free-hours allowance instead of visitor-style free
        # minutes — see _apply_tenant_allowance_billing. It returns False
        # only when the allowance is off AND there's no active pass, in
        # which case this falls through to the same visitor billing below.
        if self.is_registered_tenant_vehicle and self._apply_tenant_allowance_billing():
            return

        # A tenant stamp fully supersedes visitor billing — see
        # refresh_stamp_coverage — so a stamped ticket never reaches the
        # normal charge calculation below.
        if self.refresh_stamp_coverage():
            return

        coupon_minutes = 0
        if self.applied_coupon and self.applied_coupon.validation_type == 'FREE_MINUTES':
            coupon_minutes = self.applied_coupon.value_minutes

        # Replace any earlier student line — billing can rerun (coupon after exit).
        kept = [line for line in (self.notes or '').splitlines() if not line.startswith("Student (")]
        self.notes = '\n'.join(kept).strip()

        # An approved student (valid on the day they came in) parks free for
        # the part of the stay inside their class window; outside it they are
        # billed like any visitor (a tenant stamp covers them via the stamp
        # flow above).
        if (self.student_id and not self.registered_staff_member_id
                and self.student.is_valid_at(self.entry_time)
                and self._apply_student_billing(coupon_minutes)):
            return

        # Free minutes come off the start of the stay; the rest is split
        # into day and night minutes by the clock.
        free_minutes = self.vehicle_type.free_duration_minutes + coupon_minutes
        chargeable_minutes = max(0, self.duration_minutes - free_minutes)
        day, night = self._split_day_night(
            self.entry_time + timedelta(minutes=free_minutes), chargeable_minutes)
        self._bill(day, night)

    def _apply_student_billing(self, coupon_minutes):
        """
        Bill a student's stay: minutes inside Student.free_window are free,
        minutes before it (arrived too early) and after it (stayed past the
        allowance) are charged, less any coupon minutes. Returns False when
        the stay doesn't touch the window at all — not a class day, no class
        time, or entirely outside class time — so the caller bills a visitor.
        """
        span = self._student_free_span(self.student.free_window(self.entry_time))
        if not span:
            return False
        free_from, free_to = span

        before, after = free_from, self.duration_minutes - free_to
        coupon_before = min(coupon_minutes, before)
        coupon_after = min(coupon_minutes - coupon_before, after)
        day, night = 0, 0
        for start, minutes in ((coupon_before, before - coupon_before),
                               (free_to + coupon_after, after - coupon_after)):
            d, n = self._split_day_night(self.entry_time + timedelta(minutes=start), minutes)
            day, night = day + d, night + n
        self._bill(day, night)

        note = (f"Student ({self.student.vendor.name}, batch ends "
                f"{self.student.batch_end_date:%Y-%m-%d}): "
                f"{self._fmt_minutes(free_to - free_from)} free in class time, "
                f"{self._fmt_minutes(day + night)} charged.")
        self.notes = '\n'.join([self.notes, note]).strip() if self.notes else note
        return True

    def _student_free_span(self, window):
        """(free_from, free_to) in minutes after entry: the part of this stay
        inside the student's free window, or None if it doesn't overlap."""
        if not window:
            return None
        to_minutes = lambda moment: round((moment - self.entry_time).total_seconds() / 60)  # noqa: E731
        free_from = min(max(to_minutes(window[0]), 0), self.duration_minutes)
        free_to = min(max(to_minutes(window[1]), 0), self.duration_minutes)
        return (free_from, free_to) if free_to > free_from else None

    def student_billing_summary(self):
        """
        Why a student's ticket was or wasn't free, for the POS exit toast —
        operators otherwise read "this is a student" as "this is free".
        Mirrors the branches of update_and_calculate_charges. None when the
        ticket isn't a student's or hasn't been billed yet.
        """
        if not self.student_id or not self.exit_time or self.duration_minutes is None:
            return None
        student, entry = self.student, self.entry_time
        hhmm = lambda moment: f"{timezone.localtime(moment):%H:%M}"  # noqa: E731
        stay = f"stay {hhmm(entry)}–{hhmm(self.exit_time)}"
        summary = {'applied': False, 'free_from': None, 'free_to': None, 'free_minutes': 0}

        if self.lost_ticket:
            return {**summary, 'message': "Lost ticket — flat fine, student free time not used."}
        if self.total_stamp_minutes:
            return {**summary, 'message': "Tenant stamp on this ticket — billed by the stamp, "
                                          "not student free time."}
        reason = student.invalid_reason(entry)
        if reason:
            return {**summary, 'message': f"{reason} Billed as visitor."}
        if not student.class_time_from:
            return {**summary, 'message': "No class time set for this student — billed as visitor."}
        if not student.class_time_to:
            return {**summary, 'message': "No class end time set for this student — billed as visitor."}

        window = student.free_window(entry)
        if not window:
            today = timezone.localtime(entry).strftime('%a')
            days = ', '.join(d.title() for d in student.class_days) or 'none'
            return {**summary, 'message': f"{today} is not a class day (class days: {days}) — "
                                          "billed as visitor."}

        summary.update(free_from=hhmm(window[0]), free_to=hhmm(window[1]))
        free_time = f"free time {summary['free_from']}–{summary['free_to']}"
        span = self._student_free_span(window)
        if not span:
            return {**summary, 'message': f"Outside student {free_time} ({stay}) — billed as visitor."}

        free_from, free_to = span
        charged = []
        if free_from:
            charged.append(f"{self._fmt_minutes(free_from)} before {summary['free_from']}")
        if self.duration_minutes > free_to:
            charged.append(f"{self._fmt_minutes(self.duration_minutes - free_to)} after {summary['free_to']}")
        message = f"{self._fmt_minutes(free_to - free_from)} free in student {free_time} ({stay})"
        message += f"; charged for {' and '.join(charged)}." if charged else " — fully free."
        return {**summary, 'applied': True, 'free_minutes': free_to - free_from, 'message': message}

    # --- Night pricing ---

    def _night_config(self):
        """The global config if night pricing applies to this vehicle's plan,
        else None — so a plan with no night rate bills every minute as day."""
        plan = self.vehicle_type.pricing_plan
        if not plan or plan.night_rate_per_hour <= 0:
            return None
        config = ParkingConfiguration.get_solo()
        if not config.night_pricing_enabled or config.night_start == config.night_end:
            return None
        return config

    @staticmethod
    def _night_seconds_between(start, end, night_start, night_end):
        """Seconds of [start, end) that fall inside the local-time night
        window [night_start, night_end), which may wrap past midnight."""
        if end <= start:
            return 0.0
        tz = timezone.get_current_timezone()
        local_start = timezone.localtime(start, tz)
        local_end = timezone.localtime(end, tz)
        wraps = night_end <= night_start

        seconds = 0.0
        # Start a day early: a wrapping window that began yesterday evening
        # still covers this morning.
        day = local_start.date() - timedelta(days=1)
        while day <= local_end.date():
            window_start = timezone.make_aware(datetime.combine(day, night_start), tz)
            end_day = day + timedelta(days=1) if wraps else day
            window_end = timezone.make_aware(datetime.combine(end_day, night_end), tz)
            overlap = (min(end, window_end) - max(start, window_start)).total_seconds()
            seconds += max(0.0, overlap)
            day += timedelta(days=1)
        return seconds

    @staticmethod
    def _night_window_at(moment, night_start, night_end):
        """The aware (start, end) of the night window containing `moment`,
        or None when `moment` is day time."""
        tz = timezone.get_current_timezone()
        local = timezone.localtime(moment, tz)
        wraps = night_end <= night_start
        for day in (local.date() - timedelta(days=1), local.date()):
            window_start = timezone.make_aware(datetime.combine(day, night_start), tz)
            end_day = day + timedelta(days=1) if wraps else day
            window_end = timezone.make_aware(datetime.combine(end_day, night_end), tz)
            if window_start <= moment < window_end:
                return window_start, window_end
        return None

    def _boundary_grace_night_minutes(self):
        """
        Night minutes a registered vehicle isn't billed for because its stay
        only just crosses a night boundary: arriving at most
        night_morning_grace_minutes before night_end and staying into the
        day, or arriving in the day and leaving at most
        night_evening_grace_minutes after night_start. Past the grace the
        whole segment is billed — a threshold, not a deduction — and full
        nights (and stays entirely inside one) are never waived.
        """
        config = self._night_config()
        if not config or not self.exit_time:
            return 0
        waived = 0
        morning = self._night_window_at(self.entry_time, config.night_start, config.night_end)
        if morning and self.exit_time >= morning[1]:
            seconds = (morning[1] - self.entry_time).total_seconds()
            if seconds <= config.night_morning_grace_minutes * 60:
                waived += round(seconds / 60)
        evening = self._night_window_at(
            self.exit_time - timedelta(microseconds=1), config.night_start, config.night_end)
        if evening and self.entry_time <= evening[0]:
            seconds = (self.exit_time - evening[0]).total_seconds()
            if seconds <= config.night_evening_grace_minutes * 60:
                waived += round(seconds / 60)
        return waived

    def _split_day_night(self, start, minutes):
        """Split `minutes` of parking starting at `start` into
        (day_minutes, night_minutes)."""
        minutes = max(0, int(minutes))
        config = self._night_config()
        if not minutes or not config:
            return minutes, 0
        night_seconds = self._night_seconds_between(
            start, start + timedelta(minutes=minutes), config.night_start, config.night_end)
        night = min(minutes, int(round(night_seconds / 60)))
        return minutes - night, night

    def _price(self, day_minutes, night_minutes):
        """Day minutes through the plan's normal pricing, night minutes at
        its flat night_rate_per_hour. Unrounded."""
        charge = self._calculate_charge_from_plan(day_minutes)
        plan = self.vehicle_type.pricing_plan
        if night_minutes > 0 and plan:
            charge += Decimal(night_minutes) / Decimal('60') * plan.night_rate_per_hour
        return charge.quantize(Decimal('0.01'))

    def _bill(self, day_minutes, night_minutes=0):
        """Shared subtotal -> minimum-charge -> round -> status tail used by
        both normal visitor billing and tenant allowance billing."""
        subtotal = self._price(day_minutes, night_minutes)

        # Apply minimum charge only if there are chargeable minutes
        if day_minutes + night_minutes > 0:
            pricing_plan = self.vehicle_type.pricing_plan
            if pricing_plan and pricing_plan.minimum_charge > 0 and subtotal < pricing_plan.minimum_charge:
                subtotal = pricing_plan.minimum_charge

        # Set final charge and status
        self.calculated_charge = self._round_charge_up_to_multiple(subtotal)
        self.status = 'WAIVED' if self.calculated_charge == Decimal('0.00') else 'COMPLETED'

    # How far back to look for the entry that opened the current free window.
    # Only a chain of entries each less than tenant_free_hours apart reaches
    # back further than one window, so this is a query bound, not a rule.
    FREE_WINDOW_SEARCH_DAYS = 30

    def _free_window_start(self, window):
        """
        When the free window covering this entry opened. A window opens at an
        entry and lasts `window`; later entries inside it share it, so leaving
        and coming back never restarts the clock. The first entry after it
        ends opens a new one. auto_closed sessions have no real exit time, so
        they are skipped (objects.valid()).
        """
        earlier = ParkingSession.objects.valid().filter(
            registered_staff_member_id=self.registered_staff_member_id,
            entry_time__lt=self.entry_time,
            entry_time__gte=self.entry_time - timedelta(days=self.FREE_WINDOW_SEARCH_DAYS),
        ).exclude(pk=self.pk).order_by('-entry_time').values_list('entry_time', flat=True)

        # Walk back to an entry at least `window` after the one before it —
        # that entry certainly opened a window — then replay forward.
        chain = [self.entry_time]
        for entry in earlier.iterator():
            if chain[-1] - entry >= window:
                break
            chain.append(entry)

        start = None
        for entry in reversed(chain):
            if start is None or entry >= start + window:
                start = entry
        return start

    @staticmethod
    def _fmt_minutes(minutes):
        hours, mins = divmod(int(minutes), 60)
        if not hours:
            return f"{mins}m"
        return f"{hours}h {mins}m" if mins else f"{hours}h"

    def _apply_tenant_allowance_billing(self):
        """
        Billing for a registered tenant vehicle (pass holder or not). Day
        minutes inside the free window — the tenant's tenant_free_hours (or the global ParkingConfiguration default)
        from the entry that opened it (see _free_window_start) — are free.
        Night minutes are always charged, and day minutes after the window
        ends are billed like a visitor's. e.g. entry 12:00 -> free until
        22:00, then 22:00-00:00 at the night rate.

        Returns True if this fully decided the charge/status, False if the
        caller should fall through to normal visitor-style billing — which
        only happens when the allowance is off AND there's no active pass.
        """
        # Mirrors the tenant-vehicle branch refresh_stamp_coverage already
        # has: never covers a tenant's own vehicle, but drops any stray
        # TenantBill left over from before it was linked to this Staff row.
        self.refresh_stamp_coverage()

        active_pass = self.registered_staff_member.parking_passes.filter(
            is_active=True,
            valid_from__lte=self.exit_time,
            valid_until__gte=self.exit_time
        ).first()
        if active_pass:
            self.applied_pass = active_pass

        # Night minutes are billed to everyone, pass holders included; the
        # free allowance and the pass only ever cover day minutes.
        day_minutes, night_minutes = self._split_day_night(self.entry_time, self.duration_minutes)

        # Arriving just before night_end or leaving just after night_start
        # isn't billed for those few night minutes.
        night_grace = min(night_minutes, self._boundary_grace_night_minutes())
        night_minutes -= night_grace

        config = ParkingConfiguration.get_solo()
        if not config.tenant_allowance_enabled:
            if not active_pass:
                return False
            self._bill(0, night_minutes)
            if self.calculated_charge == Decimal('0.00'):
                self.status = 'COVERED_BY_PASS'
            return True

        company = self.registered_staff_member.company
        free_hours = company.effective_tenant_free_hours if company else config.tenant_free_hours
        window = timedelta(hours=free_hours)
        window_start = self._free_window_start(window)
        window_end = window_start + window
        in_window = min(self.duration_minutes,
                        max(0, int((window_end - self.entry_time).total_seconds() // 60)))
        free_day, _ = self._split_day_night(self.entry_time, in_window)
        over_minutes = day_minutes - free_day

        coupon_minutes = 0
        if self.applied_coupon and self.applied_coupon.validation_type == 'FREE_MINUTES':
            coupon_minutes = self.applied_coupon.value_minutes

        chargeable = max(0, over_minutes - coupon_minutes)
        self._bill(chargeable, night_minutes)

        # Billing can be recalculated for the same session (e.g. a coupon
        # applied after exit), so replace any earlier allowance line.
        local_start, local_end = timezone.localtime(window_start), timezone.localtime(window_end)
        note = (f"Free allowance ({free_hours}h from "
                f"{local_start:%d %b %H:%M}, until {local_end:%d %b %H:%M}): "
                f"{self._fmt_minutes(free_day)} free this visit, "
                f"{self._fmt_minutes(chargeable)} charged.")
        if night_minutes:
            note += (f" Night: {self._fmt_minutes(night_minutes)} charged at "
                     f"{self.vehicle_type.pricing_plan.night_rate_per_hour}/h.")
        if night_grace:
            note += f" Night grace: {self._fmt_minutes(night_grace)} free."
        kept = [line for line in (self.notes or '').splitlines()
                if not line.startswith("Free allowance (")]
        self.notes = '\n'.join([*kept, note]).strip()

        if self.calculated_charge == Decimal('0.00') and active_pass:
            # Distinguishes "subscriber, nothing owed" from the generic
            # visitor-style WAIVED that _bill would set.
            self.status = 'COVERED_BY_PASS'
        return True

    def apply_coupon(self, coupon_code):
        if self.status not in ['ACTIVE', 'COMPLETED']:
            raise ValidationError("Cannot apply coupon to a completed or paid session")

        coupon = Coupon.objects.get(code__iexact=coupon_code)
        is_valid, message = coupon.is_valid()
        if not is_valid:
            raise ValidationError(message)

        if coupon.validation_type == 'FREE_MINUTES' and coupon.value_minutes <= 0:
            raise ValidationError("This coupon doesn't provide any free minutes")

        self.applied_coupon = coupon
        self.save()  # This will trigger charge recalculation

    @property
    def total_stamp_minutes(self):
        return self.stamps.aggregate(total=Sum('free_minutes_granted'))['total'] or 0

    @property
    def is_registered_tenant_vehicle(self):
        """
        True when this ticket belongs to a tenant's own registered vehicle —
        a Staff card holder, set either by the tenant-card flow or matched by
        plate in save(). Stamping is a visitor-validation tool, so these
        sessions are never stampable and never bill their tenant.
        """
        return self.registered_staff_member_id is not None

    def refresh_stamp_coverage(self):
        """
        A tenant stamp covers the visitor for free up to the sum of minutes
        granted by this ticket's stamps (Vendor.stamp_free_minutes at stamp
        time). While elapsed time stays within that window the session is
        fully "stamped" and the visitor is never charged. Once it overstays
        the window, the excess is billed to the tenant (the vendor of the
        most recent stamp) instead of the visitor — recorded on
        TenantBill — and the session falls back to its normal status.

        Called both while the session is still parked (stamp lookup/scan,
        since elapsed time keeps moving until exit) and at exit to
        finalize. Returns True if this session has stamps and was handled
        here (caller should skip normal charge calculation), False if there
        are no stamps to consider — including tenant-vehicle sessions, which
        are excluded from tenant billing entirely.
        """
        # A lost ticket's flat fine replaces stamp coverage (mark_lost).
        if self.lost_ticket:
            return True

        # A tenant's own vehicle is never billed back to that tenant: only a
        # stamped *visitor* ticket can produce a TenantBill. Drop any bill an
        # earlier stamp left on such a session and fall through to normal
        # visitor billing.
        if self.is_registered_tenant_vehicle:
            TenantBill.objects.filter(session=self).delete()
            return False

        total_free = self.total_stamp_minutes
        if total_free <= 0:
            return False

        elapsed = self.duration_minutes if self.exit_time else self.calculate_total_duration_minutes()
        overage = elapsed - total_free

        if overage > 0:
            latest_stamp = self.stamps.order_by('-stamped_at').first()
            day, night = self._split_day_night(
                self.entry_time + timedelta(minutes=total_free), overage)
            amount = self._round_charge_up_to_multiple(self._price(day, night))
            TenantBill.objects.update_or_create(
                session=self,
                defaults={
                    'vendor': latest_stamp.vendor,
                    'overage_minutes': overage,
                    'amount': amount,
                },
            )
            self.status = 'COMPLETED' if self.exit_time else 'ACTIVE'
        else:
            TenantBill.objects.filter(session=self).delete()
            self.status = 'STAMPED'

        if self.exit_time:
            self.calculated_charge = Decimal('0.00')

        return True

    def add_stamp(self, vendor):
        if self.status not in ['ACTIVE', 'COMPLETED', 'STAMPED']:
            raise ValidationError("Cannot stamp a completed or paid session.")

        if self.is_registered_tenant_vehicle:
            raise ValidationError(
                "This ticket belongs to a registered tenant vehicle, not a visitor "
                "— it cannot be stamped.")

        stamp = TicketStamp.objects.create(
            session=self, vendor=vendor, free_minutes_granted=vendor.stamp_free_minutes)

        # If `stamps` was already prefetched onto this instance (e.g. by the
        # viewset's queryset), that cache is now stale — drop it so
        # session.stamps.all() and total_stamp_minutes see the new row.
        getattr(self, '_prefetched_objects_cache', {}).pop('stamps', None)

        self.refresh_stamp_coverage()
        self.save()

        return stamp

    def mark_lost(self):
        """
        Close an unpaid ticket the customer lost: exit now, charged the flat
        ParkingConfiguration.lost_ticket_fine instead of the parking fee.
        Leaves it COMPLETED so the POS collects the fine through mark-paid.
        """
        if self.status not in ('ACTIVE', 'COMPLETED', 'STAMPED'):
            raise ValidationError(
                f'Ticket {self.ticket_number} is already closed ({self.get_status_display()}).')
        fine = ParkingConfiguration.get_solo().lost_ticket_fine
        # The fine replaces all other billing, including a stamp overage
        # an earlier lookup may have billed to a tenant.
        TenantBill.objects.filter(session=self).delete()
        self.exit_time = timezone.now()
        self.duration_minutes = self.calculate_total_duration_minutes()
        self.lost_ticket = True
        self.calculated_charge = fine
        self.status = 'COMPLETED'
        self.notes = f"{self.notes}\nLost ticket: fine {fine} charged instead of the parking fee.".strip()

    def mark_as_paid(self, method=None):
        if self.applied_coupon:
            Coupon.objects.filter(pk=self.applied_coupon.pk).update(
                times_used=F('times_used') + 1)
        self.status = 'PAID'
        self.payment_method = method
        if method:
            self.notes += f"\nPaid via {self.get_payment_method_display()}."

    @property
    def undiscounted_charge(self):
        if self.auto_closed:
            return Decimal('0.00')
        if self.duration_minutes is None:
            if self.exit_time:
                self.duration_minutes = self.calculate_total_duration_minutes()
            else:
                return Decimal('0.00')
        return self._price(*self._split_day_night(self.entry_time, self.duration_minutes))

    @property
    def charge_after_discount(self):
        if self.status == 'ACTIVE' or not self.exit_time or self.auto_closed:
            return Decimal('0.00')

        # Ensure duration_minutes is calculated if it's None
        if self.duration_minutes is None:
            self.duration_minutes = self.calculate_total_duration_minutes()

        free_minutes_grace = self.vehicle_type.free_duration_minutes
        free_minutes_coupon = self.applied_coupon.value_minutes if (
                self.applied_coupon and self.applied_coupon.validation_type == 'FREE_MINUTES') else 0
        free_minutes_stamps = self.total_stamp_minutes
        free_minutes = free_minutes_grace + free_minutes_coupon + free_minutes_stamps
        chargeable_minutes = max(0, self.duration_minutes - free_minutes)
        return self._price(*self._split_day_night(
            self.entry_time + timedelta(minutes=free_minutes), chargeable_minutes))

    @property
    def discount_value(self):
        return max(Decimal('0.00'), self.undiscounted_charge - self.charge_after_discount)

    def _calculate_charge_from_plan(self, chargeable_minutes: int) -> Decimal:
        """
        Calculates the raw charge based on the vehicle's pricing plan
        and a given number of chargeable minutes. This is the core billing logic.
        """
        if chargeable_minutes <= 0:
            return Decimal('0.00')

        plan = self.vehicle_type.pricing_plan
        if not plan:
            # Fallback if no pricing plan is assigned to the vehicle type
            return Decimal('0.00')

        # --- HOURLY (FIXED) ---
        if plan.plan_type == 'HOURLY':
            # Example rate_details: {"rate_per_hour": "50.00"}
            rate_per_hour = Decimal(str(plan.rate_details.get('rate_per_hour', '0.00')))
            if rate_per_hour <= 0:
                return Decimal('0.00')

            # FIXED: Calculate proportional charge based on actual minutes
            # Instead of charging for full hours only, charge proportionally
            total_hours = Decimal(chargeable_minutes) / Decimal('60')
            return (total_hours * rate_per_hour).quantize(Decimal('0.01'))

        # --- FLAT_RATE_PER_DAY ---
        elif plan.plan_type == 'FLAT_RATE_PER_DAY':
            # Example rate_details: {"rate_per_day": "300.00"}
            rate_per_day = Decimal(str(plan.rate_details.get('rate_per_day', '0.00')))
            if rate_per_day <= 0:
                return Decimal('0.00')
            # A "day" is a 24-hour period from entry.
            days = Decimal(math.ceil(Decimal(chargeable_minutes) / (Decimal('60') * Decimal('24'))))
            return (days * rate_per_day).quantize(Decimal('0.01'))

        # --- TIERED_HOURLY ---
        elif plan.plan_type == 'TIERED_HOURLY':
            # Example rate_details: {"tiers": [
            #   {"up_to_hours": 2, "rate": "40.00"},
            #   {"up_to_hours": 5, "rate": "30.00"},
            #   {"up_to_hours": 24, "rate": "20.00"}
            # ]}
            tiers = plan.rate_details.get('tiers', [])
            if not tiers:
                return Decimal('0.00')

            sorted_tiers = sorted(tiers, key=lambda x: x['up_to_hours'])

            total_charge = Decimal('0.00')
            minutes_remaining = chargeable_minutes
            previous_tier_hours = 0

            for tier in sorted_tiers:
                tier_limit_hours = Decimal(str(tier.get('up_to_hours', 0)))
                tier_rate_per_hour = Decimal(str(tier.get('rate', '0.00')))

                # Calculate how many hours are in this tier bracket
                tier_duration_hours = tier_limit_hours - previous_tier_hours
                if tier_duration_hours <= 0:
                    continue

                # Convert tier duration to minutes
                tier_duration_minutes = int(tier_duration_hours * 60)

                # Calculate minutes to charge in this tier
                minutes_in_this_tier = min(minutes_remaining, tier_duration_minutes)

                if minutes_in_this_tier > 0:
                    # FIXED: Proportional charging instead of ceiling
                    hours_in_this_tier = Decimal(minutes_in_this_tier) / Decimal('60')
                    tier_charge = hours_in_this_tier * tier_rate_per_hour
                    total_charge += tier_charge
                    minutes_remaining -= minutes_in_this_tier

                previous_tier_hours = tier_limit_hours
                if minutes_remaining <= 0:
                    break

            # Handle any remaining minutes beyond the highest tier
            if minutes_remaining > 0 and sorted_tiers:
                last_tier_rate = Decimal(str(sorted_tiers[-1].get('rate', '0.00')))
                remaining_hours = Decimal(minutes_remaining) / Decimal('60')
                total_charge += remaining_hours * last_tier_rate

            return total_charge.quantize(Decimal('0.01'))

        # Fallback for unknown plan types
        return Decimal('0.00')


class TicketStamp(models.Model):
    """
    Records a tenant's physical stamp on a visitor's parking chit. Each
    stamp grants free minutes toward the visitor's ParkingSession (see
    ParkingSession.add_stamp/total_stamp_minutes) so the gate operator has
    a real audit trail for the visit instead of recording it as a cash
    payment that was never actually taken.
    """
    session = models.ForeignKey(
        ParkingSession, on_delete=models.CASCADE, related_name='stamps')
    vendor = models.ForeignKey(
        Vendor, on_delete=models.PROTECT, related_name='ticket_stamps')
    free_minutes_granted = models.PositiveIntegerField(
        help_text="Snapshot of the tenant's stamp_free_minutes at the time this stamp was recorded."
    )
    stamped_at = models.DateTimeField(default=timezone.now)
    is_sample = models.BooleanField(
        default=False, db_index=True,
        help_text="True if this record was generated by seed_parking_data. Never set manually."
    )

    def __str__(self):
        return f"{self.vendor.name} stamp on {self.session.ticket_number}"

    class Meta:
        verbose_name = "Ticket Stamp"
        verbose_name_plural = "Ticket Stamps"
        ordering = ['-stamped_at']


class TenantBill(models.Model):
    """
    Tracks the parking charge for time a visitor's stamped ticket ran past
    the total free minutes granted by its stamps (see
    ParkingSession.refresh_stamp_coverage). A stamped ticket's visitor is
    never charged at the gate — if they overstay what the tenant covered,
    the excess is billed to the tenant instead, recorded here for now
    rather than routed through any real tenant invoicing flow.
    """
    session = models.OneToOneField(
        ParkingSession, on_delete=models.CASCADE, related_name='tenant_bill')
    vendor = models.ForeignKey(
        Vendor, on_delete=models.PROTECT, related_name='tenant_bills')
    overage_minutes = models.PositiveIntegerField(
        help_text="Minutes parked beyond the total free minutes granted by this ticket's stamps."
    )
    amount = models.DecimalField(max_digits=8, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_sample = models.BooleanField(
        default=False, db_index=True,
        help_text="True if this record was generated by seed_parking_data. Never set manually."
    )

    def __str__(self):
        return f"{self.vendor.name} bill for {self.session.ticket_number} ({self.overage_minutes}min over)"

    class Meta:
        verbose_name = "Tenant Bill"
        verbose_name_plural = "Tenant Bills"
        ordering = ['-created_at']


class CardScanLog(models.Model):
    SOURCE_CHOICES = [
        ('PHYSICAL', 'Physical Card'),
        ('DIGITAL', 'Digital Card (Online)'),
        ('OFFLINE', 'Digital Card (Offline)'),
        ('RFID', 'RFID Card'),
    ]
    ACTION_CHOICES = [('ENTRY', 'Entry'), ('EXIT', 'Exit'), ('REJECTED', 'Rejected'),
                      ('FORCED_ENTRY', 'Forced Entry (staff correction)')]

    staff = models.ForeignKey(
        Staff, on_delete=models.CASCADE, related_name='scan_logs', null=True, blank=True)
    card_code_used = models.CharField(max_length=64, blank=True)
    action = models.CharField(max_length=12, choices=ACTION_CHOICES)
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default='PHYSICAL')
    reject_reason = models.CharField(max_length=100, blank=True)
    scanned_at = models.DateTimeField(auto_now_add=True, db_index=True)
    is_sample = models.BooleanField(
        default=False, db_index=True,
        help_text="True if this record was generated by seed_parking_data. Never set manually."
    )

    def __str__(self):
        who = self.staff.name if self.staff else 'unknown'
        return f"{who} - {self.action} ({self.source}) @ {self.scanned_at:%Y-%m-%d %H:%M:%S}"

    class Meta:
        verbose_name = "Card Scan Log"
        verbose_name_plural = "Card Scan Logs"
        ordering = ['-scanned_at']


class WebhookEventLog(models.Model):
    """
    Dedup/audit log for inbound EasyManage webhook events. The receiver
    checks event_id first; if already seen, it returns 200 without
    reprocessing — makes retries (which will happen, per the outbox+cron
    design on the EasyManage side) safe no-ops.
    """
    STATUS_CHOICES = [
        ('received', 'Received'),
        ('processed', 'Processed'),
        ('failed', 'Failed'),
    ]

    event_id = models.CharField(max_length=64, unique=True, db_index=True)
    event_type = models.CharField(max_length=50)
    received_at = models.DateTimeField(auto_now_add=True)
    payload = models.JSONField(default=dict)
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default='received')
    error = models.TextField(blank=True)

    def __str__(self):
        return f"{self.event_type} ({self.event_id}) - {self.status}"

    class Meta:
        verbose_name = "Webhook Event Log"
        verbose_name_plural = "Webhook Event Logs"
        ordering = ['-received_at']
