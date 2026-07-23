# management/management/commands/seed_data.py
from datetime import timedelta
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from management.models import (
    ParkingConfiguration, PricingPlan, VehicleType, Vendor, Staff, Coupon,
    ParkingPass, ParkingSession
)

class Command(BaseCommand):
    help = 'Seeds the database with a comprehensive set of data covering all conditions and scenarios.'

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write("--- Deleting Old Data ---")
        models_to_delete = [ParkingSession, ParkingPass, Coupon, Staff, Vendor, VehicleType, PricingPlan, ParkingConfiguration]
        for model in models_to_delete: model.objects.all().delete()

        self.stdout.write("\n--- Creating Base Data ---")
        ParkingConfiguration.objects.create(pk=1)
        vendors = {'corp': Vendor.objects.create(name='Corporate HQ'), 'cinema': Vendor.objects.create(name='Cinema Paradiso')}
        p_plans = {
            'motorcycle': PricingPlan.objects.create(
                name='Motorcycle Hourly', plan_type='HOURLY', 
                rate_details={'rate': '30.00'}, minimum_charge=Decimal('15.00')
            ),
            'car': PricingPlan.objects.create(
                name='Car Tiered', plan_type='TIERED_HOURLY', 
                rate_details={"tiers": [{"up_to_hours": 2, "price": "20.00"}, {"up_to_hours": 24, "price": "100.00"}]}
            )
        }
        v_types = {
            'moto': VehicleType.objects.create(name='Motorcycle', pricing_plan=p_plans['motorcycle'], free_duration_minutes=5),
            'car': VehicleType.objects.create(name='Car', pricing_plan=p_plans['car'], free_duration_minutes=10),
        }
        staff = {'john': Staff.objects.create(name='John Doe', company=vendors['corp'], license_plate='STAFF-001', vehicle_type=v_types['car'])}
        now = timezone.now()
        coupons = {
            'waiver': Coupon.objects.create(code='WAIVE100', validation_type='COMPLETE_WAIVER'),
            'moto_30min': Coupon.objects.create(code='MOTO30', validation_type='FREE_MINUTES', value_minutes=30)
        }
        ParkingPass.objects.create(staff=staff['john'], valid_from=now - timedelta(days=15), valid_until=now + timedelta(days=15))
        self.stdout.write(self.style.SUCCESS("✓ Base data created."))

        self.stdout.write("\n--- Creating Parking Session Scenarios ---")
        today_str = now.date().strftime('%Y%m%d'); ticket_sequence = 1
        def create_session(**kwargs):
            nonlocal ticket_sequence
            coupon_to_apply = kwargs.pop('coupon_code', None); payment_method = kwargs.pop('payment_method', None)
            ticket_number = f"{today_str}-{str(ticket_sequence).zfill(4)}"
            session = ParkingSession(ticket_number=ticket_number, **kwargs); session.save()
            if session.exit_time:
                if coupon_to_apply: session.apply_coupon(coupon_to_apply)
                session.update_and_calculate_charges()
                if payment_method: session.mark_as_paid(method=payment_method)
                session.save()
            ticket_sequence += 1

        # SCENARIO 1: Active Session (Currently Parked)
        create_session(license_plate='ACTIVE-CAR', vehicle_type=v_types['car'], entry_time=now - timedelta(minutes=45))
        
        # SCENARIO 2: Covered by Staff Pass
        create_session(license_plate='STAFF-001', vehicle_type=v_types['car'], entry_time=now - timedelta(hours=3), exit_time=now)
        
        # SCENARIO 3: Waived by Complete Waiver Coupon
        create_session(vehicle_type=v_types['car'], entry_time=now - timedelta(hours=6), exit_time=now, coupon_code='WAIVE100')

        # SCENARIO 4: Tiered Rate, No Discount
        # Duration: 90min (1.5hr). Raw/Final: NRs20.00 (Tier 1).
        create_session(license_plate='CAR-TIER', vehicle_type=v_types['car'], entry_time=now - timedelta(minutes=90), exit_time=now, payment_method='CARD')

        # SCENARIO 5: NEW - Minimum Charge Triggered
        # Goal: Test that a small fee is bumped up to the minimum.
        # Duration: 30min. Grace: 5min. Chargeable: 25min. Rate: NRs0.50/min
        # Subtotal: 25 * 0.50 = NRs12.50. This is < NRs15.00 minimum.
        # Adjusted Subtotal: NRs15.00. Final Rounded: NRs15.00.
        create_session(vehicle_type=v_types['moto'], entry_time=now - timedelta(minutes=30), exit_time=now, payment_method='CASH')
        
        # SCENARIO 6: Minimum Charge NOT Triggered (with coupon)
        # Goal: Test that a fee above the minimum is not affected by it.
        # Duration: 80min. Grace: 5min. Coupon: 30min. Chargeable: 45min. Rate: NRs0.50/min.
        # Subtotal: 45 * 0.50 = NRs22.50. This is > NRs15.00 minimum.
        # Final Rounded: NRs25.00.
        create_session(vehicle_type=v_types['moto'], entry_time=now - timedelta(minutes=80), exit_time=now, coupon_code='MOTO30', payment_method='ONLINE_QR')
        
        # SCENARIO 7: Completed but Unpaid
        create_session(vehicle_type=v_types['car'], license_plate='UNPAID-1', entry_time=now - timedelta(hours=2), exit_time=now)
        
        self.stdout.write(self.style.SUCCESS("✓ All Parking Scenarios created."))
        self.stdout.write(self.style.SUCCESS("\nDatabase seeding complete!"))