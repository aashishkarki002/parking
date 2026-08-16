from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from user_app.models import User
from management.models import (
    PricingPlan, VehicleType, Vendor, ParkingSession, TicketStamp, TenantBill,
)


def make_vehicle_type(name='Test Car', free_duration_minutes=0, rate_per_hour='60.00'):
    plan = PricingPlan.objects.create(
        name=f'{name} Plan',
        plan_type='HOURLY',
        rate_details={'rate_per_hour': rate_per_hour},
    )
    return VehicleType.objects.create(
        name=name, pricing_plan=plan, free_duration_minutes=free_duration_minutes, category='CAR',
    )


def make_vendor(name='Test Tenant', stamp_free_minutes=60):
    return Vendor.objects.create(name=name, stamp_free_minutes=stamp_free_minutes)


def make_session(vehicle_type=None, entry_minutes_ago=0):
    vehicle_type = vehicle_type or make_vehicle_type()
    return ParkingSession.objects.create(
        vehicle_type=vehicle_type,
        entry_time=timezone.now() - timedelta(minutes=entry_minutes_ago),
    )


class StampCoverageModelTests(TestCase):
    """
    Model-level tests for ParkingSession.add_stamp / refresh_stamp_coverage.
    See docs/stamp_flow_test_cases.md for the scenarios these mirror.
    """

    def test_stamp_within_free_window_marks_stamped(self):
        # TC-01
        vendor = make_vendor(stamp_free_minutes=60)
        session = make_session(entry_minutes_ago=5)

        session.add_stamp(vendor)

        self.assertEqual(session.status, 'STAMPED')
        self.assertEqual(session.total_stamp_minutes, 60)
        self.assertFalse(TenantBill.objects.filter(session=session).exists())

    def test_stamp_after_exceeding_free_window_bills_tenant_and_stays_active(self):
        # TC-03
        vendor = make_vendor(stamp_free_minutes=10)
        session = make_session(entry_minutes_ago=15)

        session.add_stamp(vendor)

        self.assertEqual(session.status, 'ACTIVE')
        bill = TenantBill.objects.get(session=session)
        self.assertEqual(bill.vendor, vendor)
        self.assertEqual(bill.overage_minutes, 5)

    def test_overage_exactly_zero_at_boundary_is_covered(self):
        # TC-07: elapsed == free minutes exactly -> no overage -> STAMPED
        vendor = make_vendor(stamp_free_minutes=10)
        session = make_session(entry_minutes_ago=10)

        session.add_stamp(vendor)

        self.assertEqual(session.status, 'STAMPED')
        self.assertFalse(TenantBill.objects.filter(session=session).exists())

    def test_multiple_stamps_stack_free_minutes(self):
        # TC-05
        vendor_a = make_vendor(name='Tenant A', stamp_free_minutes=30)
        vendor_b = make_vendor(name='Tenant B', stamp_free_minutes=30)
        session = make_session(entry_minutes_ago=5)

        session.add_stamp(vendor_a)
        session.add_stamp(vendor_b)

        self.assertEqual(session.total_stamp_minutes, 60)
        self.assertEqual(session.status, 'STAMPED')

    def test_zero_free_minute_vendor_creates_stamp_but_does_not_cover_session(self):
        # TC-06 — regression guard: a vendor configured with 0 free minutes
        # should not silently flip status; the stamp record still exists.
        vendor = make_vendor(stamp_free_minutes=0)
        session = make_session(entry_minutes_ago=5)
        session.status = 'ACTIVE'
        session.save(update_fields=['status'])

        session.add_stamp(vendor)

        self.assertTrue(TicketStamp.objects.filter(session=session, vendor=vendor).exists())
        self.assertEqual(session.status, 'ACTIVE')

    def test_restamping_stamped_and_completed_sessions_is_allowed(self):
        # TC-08
        vendor = make_vendor(stamp_free_minutes=60)
        session = make_session(entry_minutes_ago=5)

        session.add_stamp(vendor)
        self.assertEqual(session.status, 'STAMPED')
        session.add_stamp(vendor)  # should not raise
        self.assertEqual(session.total_stamp_minutes, 120)

        session.status = 'COMPLETED'
        session.save(update_fields=['status'])
        session.add_stamp(vendor)  # should not raise either
        self.assertEqual(session.total_stamp_minutes, 180)

    def test_stamping_paid_session_is_rejected(self):
        # TC-09
        vendor = make_vendor(stamp_free_minutes=60)
        session = make_session(entry_minutes_ago=5)
        session.status = 'PAID'
        session.save(update_fields=['status'])

        with self.assertRaises(Exception):
            session.add_stamp(vendor)

    def test_live_lookup_flips_stamped_session_to_active_once_overage_starts(self):
        # TC-11 — refresh_stamp_coverage re-evaluates against real elapsed
        # time, not just at stamp time.
        vendor = make_vendor(stamp_free_minutes=10)
        session = make_session(entry_minutes_ago=5)
        session.add_stamp(vendor)
        self.assertEqual(session.status, 'STAMPED')

        # Simulate more time passing since the stamp was applied.
        session.entry_time = timezone.now() - timedelta(minutes=15)
        session.save(update_fields=['entry_time'])

        changed = session.refresh_stamp_coverage()
        session.save()

        self.assertTrue(changed)
        self.assertEqual(session.status, 'ACTIVE')
        self.assertTrue(TenantBill.objects.filter(session=session).exists())


class StampExitFlowAPITests(TestCase):
    """
    Regression tests for the calculate-charge / apply-stamp endpoints
    (management/views.py). Covers the bug where a STAMPED session could
    never have its exit_time recorded because calculate-charge only
    allowed status ACTIVE/COMPLETED.
    """

    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_user(email='tester@example.com', password='testpass123')
        self.client.force_authenticate(user=user)
        self.vehicle_type = make_vehicle_type()
        self.vendor = make_vendor(stamp_free_minutes=60)

    def _apply_stamp(self, session, vendor=None):
        vendor = vendor or self.vendor
        return self.client.post(
            f'/api/v1/parking/sessions/{session.ticket_number}/apply-stamp',
            {'vendor_id': vendor.id},
            format='json',
        )

    def _calculate_charge(self, session):
        return self.client.post(
            f'/api/v1/parking/sessions/{session.ticket_number}/calculate-charge',
            format='json',
        )

    def test_exit_is_recorded_for_a_fully_covered_stamped_session(self):
        # TC-02 — the actual bug: calculate-charge used to 400 on a
        # STAMPED session and exit_time was never set.
        session = make_session(self.vehicle_type, entry_minutes_ago=5)
        stamp_resp = self._apply_stamp(session)
        self.assertEqual(stamp_resp.status_code, status.HTTP_200_OK)

        session.refresh_from_db()
        self.assertEqual(session.status, 'STAMPED')
        self.assertIsNone(session.exit_time)

        exit_resp = self._calculate_charge(session)

        self.assertEqual(exit_resp.status_code, status.HTTP_200_OK)
        session.refresh_from_db()
        self.assertIsNotNone(session.exit_time)
        self.assertEqual(session.calculated_charge, Decimal('0.00'))

    def test_exit_is_recorded_for_an_overage_stamped_session(self):
        # TC-04
        session = make_session(self.vehicle_type, entry_minutes_ago=90)
        low_coverage_vendor = make_vendor(name='Low Coverage Tenant', stamp_free_minutes=10)
        stamp_resp = self._apply_stamp(session, vendor=low_coverage_vendor)
        self.assertEqual(stamp_resp.status_code, status.HTTP_200_OK)

        session.refresh_from_db()
        self.assertEqual(session.status, 'ACTIVE')
        self.assertIsNone(session.exit_time)

        exit_resp = self._calculate_charge(session)

        self.assertEqual(exit_resp.status_code, status.HTTP_200_OK)
        session.refresh_from_db()
        self.assertIsNotNone(session.exit_time)
        self.assertEqual(session.status, 'COMPLETED')
        self.assertEqual(session.calculated_charge, Decimal('0.00'))
        self.assertTrue(TenantBill.objects.filter(session=session).exists())

    def test_apply_stamp_with_missing_vendor_id_is_rejected(self):
        # TC-10
        session = make_session(self.vehicle_type, entry_minutes_ago=5)
        resp = self.client.post(
            f'/api/v1/parking/sessions/{session.ticket_number}/apply-stamp',
            {},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_apply_stamp_with_unknown_vendor_id_is_rejected(self):
        # TC-10
        session = make_session(self.vehicle_type, entry_minutes_ago=5)
        resp = self.client.post(
            f'/api/v1/parking/sessions/{session.ticket_number}/apply-stamp',
            {'vendor_id': 999999},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
