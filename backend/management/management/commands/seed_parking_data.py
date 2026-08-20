# management/management/commands/seed_parking_data.py
"""
Generates realistic, clearly-tagged fake data for local/staging frontend
development. Every record this command creates has is_sample=True, so it can
always be safely wiped and regenerated with --flush without ever touching
real data (is_sample=False or missing).

Usage:
    python manage.py seed_parking_data --flush --count 30
"""
import random
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import ProtectedError
from django.utils import timezone
from faker import Faker

from management.models import (
    CardScanLog,
    Coupon,
    CouponBatch,
    ParkingConfiguration,
    ParkingPass,
    ParkingSession,
    PricingPlan,
    Staff,
    TenantBill,
    TicketStamp,
    Vendor,
    VehicleType,
)

fake = Faker()

# Models that carry is_sample, in child-first order so --flush never trips a
# PROTECT constraint (e.g. VehicleType.pricing_plan, TicketStamp.vendor,
# TenantBill.vendor) or cascades onto a non-sample row that happens to
# reference a sample parent.
SAMPLE_MODELS_CHILD_FIRST = [
    TenantBill,
    TicketStamp,
    CardScanLog,
    ParkingSession,
    ParkingPass,
    Coupon,
    CouponBatch,
    Staff,
    VehicleType,
    PricingPlan,
    Vendor,
]

VEHICLE_TYPE_SPECS = [
    {
        "name": "Motorcycle",
        "category": "BIKE",
        "free_duration_minutes": 5,
        "plan": {"plan_type": "HOURLY", "rate_details": {"rate_per_hour": "30.00"}, "minimum_charge": Decimal("15.00")},
    },
    {
        "name": "Car",
        "category": "CAR",
        "free_duration_minutes": 10,
        "plan": {
            "plan_type": "TIERED_HOURLY",
            "rate_details": {"tiers": [
                {"up_to_hours": 2, "rate": "20.00"},
                {"up_to_hours": 6, "rate": "15.00"},
                {"up_to_hours": 24, "rate": "10.00"},
            ]},
            "minimum_charge": Decimal("0.00"),
        },
    },
    {
        "name": "Van / SUV",
        "category": "CAR",
        "free_duration_minutes": 10,
        "plan": {"plan_type": "HOURLY", "rate_details": {"rate_per_hour": "50.00"}, "minimum_charge": Decimal("25.00")},
    },
    {
        "name": "Bus / Truck",
        "category": "CAR",
        "free_duration_minutes": 0,
        "plan": {"plan_type": "FLAT_RATE_PER_DAY", "rate_details": {"rate_per_day": "500.00"}, "minimum_charge": Decimal("0.00")},
    },
]

VENDOR_NAMES = [
    "Corporate HQ",
    "Cinema Paradiso",
    "Riverside Mall",
    "Lakeside Offices",
]

STAMP_FREE_MINUTES_CHOICES = [30, 45, 60, 90]

SESSION_PAYMENT_METHODS = ["CASH", "ONLINE_PAYMENT"]


def random_plate():
    return f"BA-{random.randint(1, 99)}-{random.choice('PA CHA JA'.split())}-{random.randint(1000, 9999)}"


class Command(BaseCommand):
    help = (
        "Seeds realistic sample data (vendors, vehicle types, staff, coupons, "
        "passes, and parking sessions) tagged with is_sample=True. Safe to "
        "run repeatedly; --flush only ever deletes rows this command created."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush", action="store_true",
            help="Delete existing is_sample=True records before reseeding. Never touches is_sample=False or NULL rows.",
        )
        parser.add_argument(
            "--count", type=int, default=30,
            help="Number of sample ParkingSession records to generate (default: 30). "
                 "Reference data (vendors, vehicle types, staff, coupons) scales modestly with this but isn't 1:1.",
        )

    def handle(self, *args, **options):
        count = options["count"]
        if count < 1:
            self.stderr.write(self.style.ERROR("--count must be >= 1"))
            return

        if options["flush"]:
            self._flush_sample_data()

        with transaction.atomic():
            ParkingConfiguration.get_solo()

            vendors = self._create_vendors()
            vehicle_types = self._create_vehicle_types()
            staff = self._create_staff(count, vendors, vehicle_types)
            coupons = self._create_coupons(vendors)
            self._create_parking_passes(staff)
            sessions = self._create_parking_sessions(count, vehicle_types, staff, coupons)
            ticket_stamps, tenant_bills = self._create_ticket_stamps(sessions, vendors)
            self._create_scan_logs(sessions)

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(vendors)} vendors, {len(vehicle_types)} vehicle types, "
            f"{len(staff)} staff, {len(coupons)} coupons, {len(sessions)} parking sessions, "
            f"{len(ticket_stamps)} ticket stamps, {len(tenant_bills)} tenant bills."
        ))

    # -- flush -------------------------------------------------------------

    def _flush_sample_data(self):
        self.stdout.write("Flushing existing sample data (is_sample=True only)...")
        with transaction.atomic():
            for model in SAMPLE_MODELS_CHILD_FIRST:
                qs = model.objects.filter(is_sample=True)
                deleted_count = qs.count()
                try:
                    qs.delete()
                except ProtectedError as exc:
                    raise ProtectedError(
                        f"Could not flush sample {model.__name__} rows because non-sample "
                        f"records still reference them via PROTECT. Aborting so no real data "
                        f"is touched. Original error: {exc}",
                        exc.protected_objects,
                    ) from exc
                if deleted_count:
                    self.stdout.write(f"  deleted {deleted_count} sample {model.__name__} row(s)")

    # -- reference data ------------------------------------------------------

    def _create_vendors(self):
        # Exactly one sample vendor simulates a tenant EasyManage has blocked
        # (gate_access_allowed=False), so the "blocked tenant" gate-scan path
        # has sample data too. See sync_vendor_from_payload for the real
        # cascade this mirrors (blocked vendor -> its staff cards deactivated).
        blocked_name = VENDOR_NAMES[-1]
        vendors = []
        for i, name in enumerate(VENDOR_NAMES):
            is_blocked = name == blocked_name
            vendor, _ = Vendor.objects.update_or_create(
                name=name,
                defaults={
                    "location": fake.street_address(),
                    "contact_person": fake.name(),
                    "contact_email": fake.company_email(),
                    "stamp_free_minutes": random.choice(STAMP_FREE_MINUTES_CHOICES),
                    # Simulated EasyManage sync cache: never derived locally
                    # in production (see Vendor model docstring), but sample
                    # vendors need plausible values so the staff-quota and
                    # sync-status UI have something realistic to show.
                    "external_tenant_id": f"EM-SAMPLE-{i + 1:04d}",
                    "car_quota": random.randint(5, 20),
                    "bike_quota": random.randint(3, 15),
                    "gate_access_allowed": not is_blocked,
                    "last_synced_at": timezone.now() - timedelta(hours=random.randint(1, 48)),
                    "sync_source": random.choice(["webhook", "pull"]),
                    "is_sample": True,
                },
            )
            vendors.append(vendor)
        return vendors

    def _create_vehicle_types(self):
        vehicle_types = []
        for spec in VEHICLE_TYPE_SPECS:
            plan, _ = PricingPlan.objects.update_or_create(
                name=f"{spec['name']} Plan",
                defaults={**spec["plan"], "is_sample": True},
            )
            vtype, _ = VehicleType.objects.update_or_create(
                name=spec["name"],
                defaults={
                    "pricing_plan": plan,
                    "free_duration_minutes": spec["free_duration_minutes"],
                    "category": spec["category"],
                    "is_sample": True,
                },
            )
            vehicle_types.append(vtype)
        return vehicle_types

    def _create_staff(self, session_count, vendors, vehicle_types):
        staff_count = min(max(session_count // 3, 5), 25)
        staff = []
        used_plates = set()
        for i in range(staff_count):
            plate = f"STAFF-{i + 1:03d}"
            used_plates.add(plate)
            company = random.choice(vendors)
            # Mirrors sync_vendor_from_payload's cascade: a blocked vendor's
            # staff cards are never active, sample data or not.
            is_card_active = company.gate_access_allowed and random.random() > 0.1
            member, _ = Staff.objects.update_or_create(
                license_plate=plate,
                defaults={
                    "name": fake.name(),
                    "email": fake.email(),
                    "company": company,
                    "vehicle_type": random.choice(vehicle_types),
                    "is_card_active": is_card_active,
                    "is_sample": True,
                },
            )
            staff.append(member)
        return staff

    def _create_coupons(self, vendors):
        coupons = []

        standalone_specs = [
            ("SAMPLE-WAIVE100", "COMPLETE_WAIVER", 0),
            ("SAMPLE-MOTO30", "FREE_MINUTES", 30),
            ("SAMPLE-CAR60", "FREE_MINUTES", 60),
            ("SAMPLE-EXPIRED10", "FREE_MINUTES", 10),
            ("SAMPLE-INACTIVE", "FREE_MINUTES", 15),
        ]
        now = timezone.now()
        for code, validation_type, minutes in standalone_specs:
            is_expired = code == "SAMPLE-EXPIRED10"
            is_inactive = code == "SAMPLE-INACTIVE"
            coupon, _ = Coupon.objects.update_or_create(
                code=code,
                defaults={
                    "validation_type": validation_type,
                    "value_minutes": minutes,
                    "issued_by": random.choice(vendors),
                    "price": Decimal("0.00"),
                    "is_active": not is_inactive,
                    "valid_from": now - timedelta(days=60),
                    "valid_until": (now - timedelta(days=1)) if is_expired else (now + timedelta(days=60)),
                    "max_uses": 500,
                    "is_sample": True,
                },
            )
            coupons.append(coupon)

        # A couple of coupon batches, so bulk-purchase views have sample data too.
        CouponBatch.objects.filter(is_sample=True, vendor__in=vendors).delete()
        for vendor in vendors[:2]:
            batch = CouponBatch.objects.create(
                vendor=vendor,
                validation_type="FREE_MINUTES",
                value_minutes=20,
                valid_from=now - timedelta(days=30),
                valid_until=now + timedelta(days=90),
                number_of_coupons=8,
                base_price_per_coupon=Decimal("50.00"),
                is_paid=True,
                payment_method="CASH",
                notes="Sample batch generated by seed_parking_data.",
                is_sample=True,
            )
            # CouponBatch.save() bulk_creates its own Coupon rows without
            # is_sample set — tag them here so --flush can find them.
            batch.coupons.update(is_sample=True)
            coupons.extend(batch.coupons.all())

        return coupons

    def _create_parking_passes(self, staff):
        now = timezone.now()
        passes = []
        for member in staff:
            if random.random() > 0.4:
                continue
            starts_days_ago = random.randint(0, 20)
            duration_days = random.choice([15, 30, 90])
            parking_pass = ParkingPass.objects.create(
                staff=member,
                valid_from=now - timedelta(days=starts_days_ago),
                valid_until=now - timedelta(days=starts_days_ago) + timedelta(days=duration_days),
                price_paid=Decimal(random.choice(["500.00", "1000.00", "2500.00"])),
                is_active=random.random() > 0.1,
                notes=fake.sentence() if random.random() > 0.7 else "",
                is_sample=True,
            )
            passes.append(parking_pass)
        return passes

    # -- transactional data --------------------------------------------------

    def _create_parking_sessions(self, count, vehicle_types, staff, coupons):
        now = timezone.now()
        free_minutes_coupons = [
            c for c in coupons
            if c.validation_type == "FREE_MINUTES" and c.is_valid()[0]
        ]
        # apply_coupon()'s use isn't consumed until mark_as_paid() increments
        # times_used, and batch-generated coupons have max_uses=1 — track
        # local remaining uses so a single-use coupon isn't picked again
        # after it's already been paid off earlier in this same loop.
        coupon_uses_remaining = {c.pk: c.max_uses - c.times_used for c in free_minutes_coupons}
        sessions = []

        for _ in range(count):
            vehicle_type = random.choice(vehicle_types)
            scenario = random.choices(
                ["active", "staff_pass", "completed_paid", "completed_unpaid", "waived_coupon"],
                weights=[15, 20, 35, 20, 10],
            )[0]

            entry_time = now - timedelta(
                days=random.randint(0, 13),
                hours=random.randint(0, 23),
                minutes=random.randint(0, 59),
            )

            if scenario == "active":
                session = ParkingSession(
                    vehicle_type=vehicle_type,
                    license_plate=random_plate(),
                    entry_time=now - timedelta(minutes=random.randint(2, 180)),
                    is_sample=True,
                )
                session.save()
                sessions.append(session)
                continue

            if scenario == "staff_pass":
                member = random.choice(staff)
                exit_time = entry_time + timedelta(minutes=random.randint(20, 240))
                session = ParkingSession(
                    vehicle_type=member.vehicle_type or vehicle_type,
                    license_plate=member.license_plate,
                    entry_time=entry_time,
                    exit_time=exit_time,
                    is_sample=True,
                )
                session.save()
                session.update_and_calculate_charges()
                session.save()
                sessions.append(session)
                continue

            exit_time = entry_time + timedelta(minutes=random.randint(15, 300))
            session = ParkingSession(
                vehicle_type=vehicle_type,
                license_plate=random_plate(),
                entry_time=entry_time,
                exit_time=exit_time,
                is_sample=True,
            )
            session.save()

            if scenario == "waived_coupon":
                waiver = next((c for c in coupons if c.validation_type == "COMPLETE_WAIVER" and c.is_active), None)
                if waiver:
                    session.apply_coupon(waiver.code)
            elif random.random() > 0.6:
                usable = [c for c in free_minutes_coupons if coupon_uses_remaining[c.pk] > 0]
                if usable:
                    chosen = random.choice(usable)
                    session.apply_coupon(chosen.code)
                    coupon_uses_remaining[chosen.pk] -= 1

            session.update_and_calculate_charges()

            if scenario == "completed_paid" and session.status == "COMPLETED":
                session.mark_as_paid(method=random.choice(SESSION_PAYMENT_METHODS))

            session.save()
            sessions.append(session)

        return sessions

    def _create_ticket_stamps(self, sessions, vendors):
        # A tenant "stamps" a visitor's chit before they've settled up at the
        # gate, so only sessions still sitting in COMPLETED (exited, unpaid)
        # are realistic candidates. add_stamp() recalculates the session's
        # stamp coverage itself, which may flip its status to STAMPED (fully
        # covered) or leave it COMPLETED with a TenantBill for the overage
        # (see ParkingSession.refresh_stamp_coverage).
        stamps = []
        tenant_bills = []
        candidates = [s for s in sessions if s.status == "COMPLETED"]
        for session in candidates:
            if random.random() > 0.35:
                continue
            vendor = random.choice(vendors)
            stamp = session.add_stamp(vendor)
            TicketStamp.objects.filter(pk=stamp.pk).update(is_sample=True)
            stamps.append(stamp)
            bill = TenantBill.objects.filter(session=session).first()
            if bill:
                bill.is_sample = True
                bill.save(update_fields=["is_sample"])
                tenant_bills.append(bill)
        return stamps, tenant_bills

    def _create_scan_logs(self, sessions):
        # scanned_at is auto_now_add, so it can't be set on the initial save();
        # backdate it afterwards to line up with the session's actual times,
        # otherwise every sample log clusters at "now" and looks unrealistic.
        logs = []
        for session in sessions:
            if not session.registered_staff_member:
                continue
            entry_log = CardScanLog(
                staff=session.registered_staff_member,
                card_code_used=str(session.registered_staff_member.card_code),
                action="ENTRY",
                source=random.choice(["PHYSICAL", "DIGITAL", "OFFLINE"]),
                is_sample=True,
            )
            entry_log.save()
            CardScanLog.objects.filter(pk=entry_log.pk).update(scanned_at=session.entry_time)
            logs.append(entry_log)
            if session.exit_time:
                exit_log = CardScanLog(
                    staff=session.registered_staff_member,
                    card_code_used=str(session.registered_staff_member.card_code),
                    action="EXIT",
                    source=random.choice(["PHYSICAL", "DIGITAL", "OFFLINE"]),
                    is_sample=True,
                )
                exit_log.save()
                CardScanLog.objects.filter(pk=exit_log.pk).update(scanned_at=session.exit_time)
                logs.append(exit_log)
        return logs
