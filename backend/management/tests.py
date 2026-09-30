from datetime import datetime, time, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.db.models import F
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from django.contrib.auth.models import Group

from user_app.models import User
from user_app.roles import ADMIN, POS, SUPERADMIN
from management.models import (
    PricingPlan, VehicleType, Vendor, ParkingSession, ParkingPass, Staff, TicketStamp,
    TenantBill, ParkingConfiguration, Coupon, RFIDCard, CardScanLog,
)


def make_pos_user(email):
    # These endpoints are gated by IsPOSOrAbove, which checks the role group.
    user = User.objects.create_user(email=email, password='testpass123')
    user.groups.add(Group.objects.get(name=POS))
    return user


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


def make_session(vehicle_type=None, entry_minutes_ago=0, license_plate=None):
    vehicle_type = vehicle_type or make_vehicle_type()
    return ParkingSession.objects.create(
        vehicle_type=vehicle_type,
        license_plate=license_plate,
        entry_time=timezone.now() - timedelta(minutes=entry_minutes_ago),
    )


def make_staff(company, vehicle_type=None, license_plate='BA-1-PA-1234', name='Tenant Staffer'):
    return Staff.objects.create(
        name=name,
        company=company,
        license_plate=license_plate,
        vehicle_type=vehicle_type,
    )


def make_tenant_vehicle_session(vendor, vehicle_type=None, entry_minutes_ago=0,
                                license_plate='BA-1-PA-1234'):
    """
    A session for a tenant's OWN registered vehicle. ParkingSession.save()
    links registered_staff_member by plate, so creating the Staff row first
    is enough to make this a tenant-vehicle session.
    """
    vehicle_type = vehicle_type or make_vehicle_type()
    make_staff(company=vendor, vehicle_type=vehicle_type, license_plate=license_plate)
    return make_session(vehicle_type, entry_minutes_ago, license_plate=license_plate)


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


class TenantVehicleStampTests(TestCase):
    """
    A tenant is billed only for the visitor tickets it stamps — never for its
    own registered vehicles. TC-13/TC-14.
    """

    def test_tenant_own_vehicle_cannot_be_stamped(self):
        # TC-13
        vendor = make_vendor(stamp_free_minutes=10)
        session = make_tenant_vehicle_session(vendor, entry_minutes_ago=30)

        with self.assertRaises(ValidationError):
            session.add_stamp(vendor)

        self.assertFalse(TicketStamp.objects.filter(session=session).exists())
        self.assertFalse(TenantBill.objects.filter(session=session).exists())

    def test_tenant_vehicle_session_never_produces_a_tenant_bill(self):
        # TC-14 — a stamp recorded before this rule existed must not keep
        # billing the tenant: refresh_stamp_coverage drops the bill and hands
        # the session back to normal visitor billing.
        vendor = make_vendor(stamp_free_minutes=10)
        session = make_tenant_vehicle_session(vendor, entry_minutes_ago=30)
        TicketStamp.objects.create(session=session, vendor=vendor, free_minutes_granted=10)
        TenantBill.objects.create(
            session=session, vendor=vendor, overage_minutes=20, amount=Decimal('20.00'))

        handled = session.refresh_stamp_coverage()

        self.assertFalse(handled)
        self.assertFalse(TenantBill.objects.filter(session=session).exists())

    def test_exit_charges_a_tenant_vehicle_normally_instead_of_billing_the_tenant(self):
        # TC-14 (exit path): with no active pass, the tenant's own vehicle is
        # charged like any other ticket — the tenant is not billed.
        vendor = make_vendor(stamp_free_minutes=10)
        vehicle_type = make_vehicle_type(name='Tenant Car', free_duration_minutes=0)
        session = make_tenant_vehicle_session(
            vendor, vehicle_type=vehicle_type, entry_minutes_ago=13 * 60)
        TicketStamp.objects.create(session=session, vendor=vendor, free_minutes_granted=10)

        session.exit_time = timezone.now()
        session.update_and_calculate_charges()
        session.save()

        self.assertEqual(session.status, 'COMPLETED')
        self.assertGreater(session.calculated_charge, Decimal('0.00'))
        self.assertFalse(TenantBill.objects.filter(session=session).exists())


class StampExitFlowAPITests(TestCase):
    """
    Regression tests for the calculate-charge / apply-stamp endpoints
    (management/views.py). Covers the bug where a STAMPED session could
    never have its exit_time recorded because calculate-charge only
    allowed status ACTIVE/COMPLETED.
    """

    def setUp(self):
        self.client = APIClient()
        user = make_pos_user('tester@example.com')
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

    def test_apply_stamp_on_a_tenant_vehicle_is_rejected(self):
        # TC-13 (API): the operator gets a 400 with a readable reason instead
        # of silently billing the tenant for its own car.
        session = make_tenant_vehicle_session(
            self.vendor, vehicle_type=self.vehicle_type, entry_minutes_ago=90)

        resp = self._apply_stamp(session)

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('tenant vehicle', resp.data['error'])
        self.assertFalse(TenantBill.objects.filter(session=session).exists())

    def test_apply_stamp_with_unknown_vendor_id_is_rejected(self):
        # TC-10
        session = make_session(self.vehicle_type, entry_minutes_ago=5)
        resp = self.client.post(
            f'/api/v1/parking/sessions/{session.ticket_number}/apply-stamp',
            {'vendor_id': 999999},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class ExitReceiptPayloadTests(TestCase):
    """
    The exit screen decides whether to auto-print a receipt purely from the
    calculate-charge payload. Suppressing the printout for a tenant's own
    vehicle / monthly subscriber must not also swallow the *stamped visitor*
    receipt — the visitor's slip is their proof of which tenant validated
    the free exit.

    These lock the exact fields the frontend keys off
    (Options.tsx: isNoReceiptTenantExit), so the two can't drift apart.
    """

    def setUp(self):
        self.client = APIClient()
        user = make_pos_user('receipt@example.com')
        self.client.force_authenticate(user=user)
        self.vehicle_type = make_vehicle_type()
        self.vendor = make_vendor(stamp_free_minutes=60)

    def _exit(self, session):
        resp = self.client.post(
            f'/api/v1/parking/sessions/{session.ticket_number}/calculate-charge',
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        return resp.data

    @staticmethod
    def _suppresses_receipt(payload):
        """Mirror of isNoReceiptTenantExit() in Options.tsx."""
        charge = Decimal(payload.get('calculated_charge') or '0')
        return charge <= 0 and (
            payload.get('status') == 'COVERED_BY_PASS'
            or bool(payload.get('registered_staff_member'))
        )

    def test_stamped_visitor_exit_payload_still_prints(self):
        session = make_session(self.vehicle_type, entry_minutes_ago=5)
        session.add_stamp(self.vendor)

        payload = self._exit(session)

        # A stamped ticket is a visitor's, never a tenant's own vehicle.
        self.assertIsNone(payload['registered_staff_member'])
        self.assertEqual(len(payload['stamps']), 1)
        self.assertEqual(Decimal(payload['calculated_charge']), Decimal('0.00'))
        self.assertFalse(self._suppresses_receipt(payload))

    def test_overage_stamped_visitor_exit_payload_still_prints(self):
        session = make_session(self.vehicle_type, entry_minutes_ago=90)
        session.add_stamp(make_vendor(name='Low Coverage Tenant', stamp_free_minutes=10))

        payload = self._exit(session)

        self.assertIsNone(payload['registered_staff_member'])
        self.assertIsNotNone(payload['tenant_bill'])
        self.assertEqual(Decimal(payload['calculated_charge']), Decimal('0.00'))
        self.assertFalse(self._suppresses_receipt(payload))

    def test_monthly_subscriber_exit_payload_prints_nothing(self):
        staff = make_staff(company=self.vendor, vehicle_type=self.vehicle_type,
                           license_plate='BA-2-CH-4321')
        now = timezone.now()
        ParkingPass.objects.create(
            staff=staff,
            valid_from=now - timedelta(days=1),
            valid_until=now + timedelta(days=30),
        )
        session = make_session(self.vehicle_type, entry_minutes_ago=90,
                               license_plate='BA-2-CH-4321')

        payload = self._exit(session)

        self.assertEqual(payload['status'], 'COVERED_BY_PASS')
        self.assertTrue(self._suppresses_receipt(payload))

    def test_tenant_vehicle_without_a_valid_pass_is_charged_and_still_prints(self):
        # registered_staff_member is matched by plate whether or not the pass
        # is still valid, so a lapsed tenant overstaying the 12h allowance
        # pays — and must get the receipt for what they paid.
        session = make_tenant_vehicle_session(
            self.vendor, vehicle_type=self.vehicle_type, entry_minutes_ago=13 * 60)

        payload = self._exit(session)

        self.assertIsNotNone(payload['registered_staff_member'])
        self.assertGreater(Decimal(payload['calculated_charge']), Decimal('0.00'))
        self.assertFalse(self._suppresses_receipt(payload))


class TenantAllowanceBillingTests(TestCase):
    """
    ParkingSession._apply_tenant_allowance_billing — a registered tenant
    vehicle parks free for 12h, counted across all its sessions in the 24h
    before entry, so leaving and coming back never restarts the clock.
    Default plan is 60/hr, so the charge in rupees equals chargeable minutes.
    """

    PLATE = 'BA-1-PA-1234'

    def setUp(self):
        self.config = ParkingConfiguration.get_solo()
        self.config.tenant_allowance_enabled = True
        self.config.save()
        self.vendor = make_vendor()
        self.vehicle_type = make_vehicle_type()
        self.staff = make_staff(company=self.vendor, vehicle_type=self.vehicle_type,
                                license_plate=self.PLATE)
        # Fixed point well in the past so every session is closed.
        self.t0 = timezone.now().replace(microsecond=0) - timedelta(days=10)

    def _give_pass(self, staff=None):
        return ParkingPass.objects.create(
            staff=staff or self.staff,
            valid_from=self.t0 - timedelta(days=1),
            valid_until=timezone.now() + timedelta(days=30),
        )

    def _session(self, start_h, hours, plate=PLATE, **extra):
        entry = self.t0 + timedelta(hours=start_h)
        return ParkingSession.objects.create(
            vehicle_type=self.vehicle_type, license_plate=plate,
            entry_time=entry, exit_time=entry + timedelta(hours=hours), **extra)

    def _bill(self, session):
        session.update_and_calculate_charges()
        session.save()
        return session

    def test_pass_holder_free_within_12h(self):
        self._give_pass()
        session = self._bill(self._session(0, 10))

        self.assertEqual(session.status, 'COVERED_BY_PASS')
        self.assertEqual(session.calculated_charge, Decimal('0.00'))

    def test_pass_holder_charged_past_12h(self):
        self._give_pass()
        session = self._bill(self._session(0, 12.75))

        self.assertEqual(session.status, 'COMPLETED')
        self.assertIsNotNone(session.applied_pass)
        self.assertEqual(session.calculated_charge, Decimal('45.00'))
        self.assertIn('45m charged', session.notes)

    def test_tenant_without_pass_gets_12h_then_charged(self):
        session = self._bill(self._session(0, 13))

        self.assertEqual(session.status, 'COMPLETED')
        self.assertIsNone(session.applied_pass)
        self.assertEqual(session.calculated_charge, Decimal('60.00'))

    def test_tenant_without_pass_within_12h_is_waived(self):
        session = self._bill(self._session(0, 3))

        self.assertEqual(session.status, 'WAIVED')
        self.assertEqual(session.calculated_charge, Decimal('0.00'))

    def test_re_entering_does_not_reset_the_12h_clock(self):
        self._give_pass()
        self._bill(self._session(0, 6))
        # Back at 7h for 8h: the window opened at 0h still ends at 12h,
        # so 7h-12h is free and 12h-15h is charged.
        session = self._bill(self._session(7, 8))

        self.assertEqual(session.status, 'COMPLETED')
        self.assertEqual(session.calculated_charge, Decimal('180.00'))

    def test_entry_after_the_window_ends_opens_a_new_window(self):
        self._give_pass()
        self._bill(self._session(0, 6))
        second = self._bill(self._session(6.5, 6))
        third = self._bill(self._session(13, 6))

        # 6.5h-12.5h: last 30 min fall after the 0h-12h window.
        self.assertEqual(second.calculated_charge, Decimal('30.00'))
        # 13h is after 12h, so it opens a fresh 13h-25h window.
        self.assertEqual(third.status, 'COVERED_BY_PASS')
        self.assertEqual(third.calculated_charge, Decimal('0.00'))

    def test_window_is_found_through_a_chain_of_re_entries(self):
        # Windows: 0h (entries 0h, 10h), then 13h (entries 13h, 20h).
        for start in (0, 10, 13):
            self._bill(self._session(start, 0.5))
        session = self._bill(self._session(20, 7))

        # 13h window ends at 25h: 25h-27h charged.
        self.assertEqual(session.calculated_charge, Decimal('120.00'))

    def test_sessions_older_than_24h_do_not_count(self):
        self._bill(self._session(0, 10))
        session = self._bill(self._session(40, 12))

        self.assertEqual(session.calculated_charge, Decimal('0.00'))

    def test_auto_closed_prior_session_is_ignored(self):
        prior = self._session(0, 10)
        prior.auto_closed = True
        prior.save()
        session = self._bill(self._session(11, 12))

        self.assertEqual(session.calculated_charge, Decimal('0.00'))

    def test_allowance_is_per_vehicle_even_on_a_shared_pass(self):
        other = make_staff(company=self.vendor, vehicle_type=self.vehicle_type,
                           license_plate='BA-9-PA-9999', name='Second Car')
        pass_ = self._give_pass()
        pass_.extra_vehicles.add(other)
        self._bill(self._session(0, 10, plate='BA-9-PA-9999'))
        session = self._bill(self._session(11, 12))

        self.assertEqual(session.status, 'COVERED_BY_PASS')
        self.assertEqual(session.calculated_charge, Decimal('0.00'))

    def test_multi_day_stay_charges_everything_after_12h(self):
        self._give_pass()
        session = self._bill(self._session(0, 72))

        self.assertEqual(session.calculated_charge, Decimal(60 * 60).quantize(Decimal('0.01')))

    def test_coupon_minutes_reduce_the_overage(self):
        coupon = Coupon.objects.create(
            code='TENANTOVERAGE', validation_type='FREE_MINUTES', value_minutes=15, max_uses=1)
        session = self._bill(self._session(0, 12.75, applied_coupon=coupon))

        self.assertEqual(session.calculated_charge, Decimal('30.00'))

    def test_recalculating_replaces_the_allowance_note(self):
        session = self._bill(self._session(0, 13))
        self._bill(session)

        self.assertEqual(session.notes.count('Free allowance ('), 1)

    def test_disabled_allowance_leaves_pass_holder_fully_free(self):
        self.config.tenant_allowance_enabled = False
        self.config.save()
        self._give_pass()
        session = self._bill(self._session(0, 20))

        self.assertEqual(session.status, 'COVERED_BY_PASS')
        self.assertEqual(session.calculated_charge, Decimal('0.00'))

    def test_custom_free_hours(self):
        self.config.tenant_free_hours = 8
        self.config.save()
        session = self._bill(self._session(0, 10))

        self.assertEqual(session.calculated_charge, Decimal('120.00'))


class NightPricingTests(TestCase):
    """
    Minutes inside the night window (default 22:00-06:00 local) are billed at
    the plan's night_rate_per_hour; the rest at the plan's normal pricing.
    Car plan: 60/hr day (1 rupee per minute), 100/hr night.
    Bike plan: 30/hr day, 50/hr night.
    """

    PLATE = 'BA-2-PA-2222'

    def setUp(self):
        self.config = ParkingConfiguration.get_solo()
        self.config.tenant_allowance_enabled = True
        self.config.save()
        self.car = make_vehicle_type('Night Car', rate_per_hour='60.00')
        self.car.pricing_plan.night_rate_per_hour = Decimal('100.00')
        self.car.pricing_plan.save()
        self.bike = make_vehicle_type('Night Bike', rate_per_hour='30.00')
        self.bike.category = 'BIKE'
        self.bike.save()
        self.bike.pricing_plan.night_rate_per_hour = Decimal('50.00')
        self.bike.pricing_plan.save()

    def at(self, day, hour, minute=0):
        """A local wall-clock time on 2026-09-<day>."""
        return timezone.make_aware(datetime(2026, 9, day, hour, minute))

    def _bill(self, start, end, vehicle_type=None, **extra):
        session = ParkingSession.objects.create(
            vehicle_type=vehicle_type or self.car, entry_time=start, exit_time=end, **extra)
        session.update_and_calculate_charges()
        session.save()
        return session

    def _tenant(self, with_pass=False):
        vendor = make_vendor()
        staff = make_staff(company=vendor, vehicle_type=self.car, license_plate=self.PLATE)
        if with_pass:
            ParkingPass.objects.create(
                staff=staff, valid_from=self.at(1, 0), valid_until=self.at(28, 0))
        return staff

    def test_visit_across_22h_splits_day_and_night(self):
        # 21:00-22:00 day (60) + 22:00-23:00 night (100)
        session = self._bill(self.at(1, 21), self.at(1, 23))

        self.assertEqual(session.calculated_charge, Decimal('160.00'))
        self.assertEqual(session.undiscounted_charge, Decimal('160.00'))
        self.assertEqual(session.charge_after_discount, Decimal('160.00'))

    def test_fully_night_bike_uses_bike_night_rate(self):
        session = self._bill(self.at(1, 23), self.at(2, 5), vehicle_type=self.bike)

        self.assertEqual(session.calculated_charge, Decimal('300.00'))

    def test_multi_day_stay_counts_every_night(self):
        # 20:00 day 1 -> 08:00 day 3: two 8h nights, 20h of day.
        session = self._bill(self.at(1, 20), self.at(3, 8))

        self.assertEqual(session.calculated_charge, Decimal(20 * 60 + 16 * 100).quantize(Decimal('0.01')))

    def test_grace_minutes_come_off_the_start_of_the_stay(self):
        self.car.free_duration_minutes = 30
        self.car.save()
        # 21:30-22:30 with 30 free: the free half hour is the day part.
        session = self._bill(self.at(1, 21, 30), self.at(1, 22, 30))

        self.assertEqual(session.calculated_charge, Decimal('50.00'))

    def test_minimum_charge_and_rounding_apply_to_the_total(self):
        plan = self.car.pricing_plan
        # 1 min day (1) + 3 min night (5.00) = 6 -> rounded up to 10
        session = self._bill(self.at(1, 21, 59), self.at(1, 22, 3))
        self.assertEqual(session.calculated_charge, Decimal('10.00'))

        plan.minimum_charge = Decimal('200.00')
        plan.save()
        session = self._bill(self.at(2, 21, 50), self.at(2, 22, 10))
        self.assertEqual(session.calculated_charge, Decimal('200.00'))

    def test_plan_without_night_rate_bills_night_like_day(self):
        self.car.pricing_plan.night_rate_per_hour = Decimal('0.00')
        self.car.pricing_plan.save()
        session = self._bill(self.at(1, 21), self.at(1, 23))

        self.assertEqual(session.calculated_charge, Decimal('120.00'))

    def test_disabled_night_pricing_bills_night_like_day(self):
        self.config.night_pricing_enabled = False
        self.config.save()
        session = self._bill(self.at(1, 21), self.at(1, 23))

        self.assertEqual(session.calculated_charge, Decimal('120.00'))

    def test_custom_window_that_does_not_wrap_midnight(self):
        self.config.night_start = time(1, 0)
        self.config.night_end = time(5, 0)
        self.config.save()
        # 00:00-02:00: 1h day + 1h night
        session = self._bill(self.at(1, 0), self.at(1, 2))

        self.assertEqual(session.calculated_charge, Decimal('160.00'))

    def test_tiered_plan_applies_tiers_to_day_minutes_only(self):
        plan = self.car.pricing_plan
        plan.plan_type = 'TIERED_HOURLY'
        plan.rate_details = {'tiers': [{'up_to_hours': 2, 'rate': '60.00'},
                                       {'up_to_hours': 24, 'rate': '30.00'}]}
        plan.save()
        # 20:00-23:00: 2h day in the first tier (120) + 1h night (100)
        session = self._bill(self.at(1, 20), self.at(1, 23))

        self.assertEqual(session.calculated_charge, Decimal('220.00'))

    def test_pass_holder_pays_night_hours_but_day_hours_stay_free(self):
        self._tenant(with_pass=True)
        # 20:00-07:00: 8h night (800), 3h day inside the 12h allowance.
        session = self._bill(self.at(1, 20), self.at(2, 7), license_plate=self.PLATE)

        self.assertIsNotNone(session.applied_pass)
        self.assertEqual(session.status, 'COMPLETED')
        self.assertEqual(session.calculated_charge, Decimal('800.00'))
        self.assertIn('Night: 8h charged', session.notes)

    def test_pass_holder_daytime_visit_is_still_covered(self):
        self._tenant(with_pass=True)
        session = self._bill(self.at(1, 9), self.at(1, 17), license_plate=self.PLATE)

        self.assertEqual(session.status, 'COVERED_BY_PASS')
        self.assertEqual(session.calculated_charge, Decimal('0.00'))

    def test_entry_at_noon_is_free_only_until_22h(self):
        self._tenant(with_pass=True)
        # 12:00-22:00 free; 22:00-00:00 is night (200).
        session = self._bill(self.at(1, 12), self.at(2, 0), license_plate=self.PLATE)

        self.assertEqual(session.calculated_charge, Decimal('200.00'))

    def test_day_hours_after_12h_from_entry_are_charged(self):
        self._tenant(with_pass=True)
        # 12:00-12:00 next day: 12:00-22:00 free, 8h night (800), then
        # 06:00-12:00 is past the 12h window (360).
        session = self._bill(self.at(1, 12), self.at(2, 12), license_plate=self.PLATE)

        self.assertEqual(session.calculated_charge, Decimal('1160.00'))

    def test_next_day_entry_opens_a_new_window(self):
        self._tenant()
        # 18:00-08:00: window 18:00-06:00, so 06:00-08:00 is charged.
        first = self._bill(self.at(1, 18), self.at(2, 8), license_plate=self.PLATE)
        # 09:00 is after that window: a fresh 12h, all free.
        session = self._bill(self.at(2, 9), self.at(2, 17), license_plate=self.PLATE)

        self.assertEqual(first.calculated_charge, Decimal('920.00'))
        self.assertEqual(session.calculated_charge, Decimal('0.00'))

    def test_disabled_allowance_pass_holder_still_pays_night(self):
        self.config.tenant_allowance_enabled = False
        self.config.save()
        self._tenant(with_pass=True)
        session = self._bill(self.at(1, 20), self.at(1, 23), license_plate=self.PLATE)

        self.assertEqual(session.status, 'COMPLETED')
        self.assertEqual(session.calculated_charge, Decimal('100.00'))

    # --- Night boundary grace (registered vehicles, default 15/15 min) ---

    def _pass_holder_bill(self, start, end, allowance=True):
        self.config.tenant_allowance_enabled = allowance
        self.config.save()
        self.car.pricing_plan.minimum_charge = Decimal('30.00')
        self.car.pricing_plan.save()
        if not Staff.objects.filter(license_plate=self.PLATE).exists():
            self._tenant(with_pass=True)
        return self._bill(start, end, license_plate=self.PLATE)

    def test_arriving_inside_morning_grace_is_free(self):
        for minute in (58, 45):
            session = self._pass_holder_bill(self.at(1, 5, minute), self.at(1, 14))
            self.assertEqual(session.calculated_charge, Decimal('0.00'), minute)
            self.assertEqual(session.status, 'COVERED_BY_PASS')
            self.assertIn(f'Night grace: {60 - minute}m free', session.notes)

    def test_arriving_before_morning_grace_bills_every_night_minute(self):
        # 05:44: 16 night min > 15, so all 16 billed (26.67) -> 30 minimum.
        session = self._pass_holder_bill(self.at(1, 5, 44), self.at(1, 14))
        self.assertEqual(session.calculated_charge, Decimal('30.00'))
        # 05:30: 30 min at 100/h = 50.
        session = self._pass_holder_bill(self.at(2, 5, 30), self.at(2, 14))
        self.assertEqual(session.calculated_charge, Decimal('50.00'))

    def test_leaving_inside_evening_grace_is_free(self):
        for minute in (10, 15):
            session = self._pass_holder_bill(self.at(1, 12), self.at(1, 22, minute))
            self.assertEqual(session.calculated_charge, Decimal('0.00'), minute)

    def test_leaving_after_evening_grace_bills_every_night_minute(self):
        session = self._pass_holder_bill(self.at(1, 12), self.at(1, 22, 16))
        self.assertEqual(session.calculated_charge, Decimal('30.00'))

    def test_stay_entirely_inside_the_night_gets_no_grace(self):
        session = self._pass_holder_bill(self.at(1, 22, 5), self.at(1, 22, 8))
        self.assertEqual(session.calculated_charge, Decimal('30.00'))

    def test_full_nights_are_billed_as_before(self):
        session = self._pass_holder_bill(self.at(1, 20), self.at(2, 8))
        self.assertEqual(session.calculated_charge, Decimal('800.00'))
        session = self._pass_holder_bill(self.at(3, 12), self.at(4, 0))
        self.assertEqual(session.calculated_charge, Decimal('200.00'))

    def test_multi_day_stay_waives_only_its_edge_segments(self):
        # 05:50 day 1 -> 22:10 day 2 with the allowance OFF: the first and
        # last 10 min are waived; the full night in between is 800.
        session = self._pass_holder_bill(self.at(1, 5, 50), self.at(2, 22, 10), allowance=False)
        self.assertEqual(session.calculated_charge, Decimal('800.00'))

    def test_grace_applies_with_allowance_off(self):
        session = self._pass_holder_bill(self.at(1, 5, 50), self.at(1, 14), allowance=False)
        self.assertEqual(session.calculated_charge, Decimal('0.00'))
        self.assertEqual(session.status, 'COVERED_BY_PASS')

    def test_zero_grace_turns_it_off(self):
        self.config.night_morning_grace_minutes = 0
        self.config.night_evening_grace_minutes = 0
        self.config.save()
        session = self._pass_holder_bill(self.at(1, 5, 58), self.at(1, 14))
        self.assertEqual(session.calculated_charge, Decimal('30.00'))

    def test_visitor_gets_no_boundary_grace(self):
        # 05:50-07:00: 10 night min (16.67) + 60 day (60) = 76.67 -> 80.
        session = self._bill(self.at(1, 5, 50), self.at(1, 7))
        self.assertEqual(session.calculated_charge, Decimal('80.00'))

    def test_registered_without_pass_and_allowance_off_bills_like_visitor(self):
        self.config.tenant_allowance_enabled = False
        self.config.save()
        self._tenant()
        session = self._bill(self.at(1, 5, 50), self.at(1, 7), license_plate=self.PLATE)
        self.assertEqual(session.calculated_charge, Decimal('80.00'))

    def test_stamp_overage_after_22h_is_billed_to_tenant_at_night_rate(self):
        vendor = make_vendor(stamp_free_minutes=60)
        session = ParkingSession.objects.create(
            vehicle_type=self.car, entry_time=self.at(1, 21), exit_time=self.at(1, 23))
        TicketStamp.objects.create(session=session, vendor=vendor, free_minutes_granted=60)
        session.update_and_calculate_charges()

        bill = TenantBill.objects.get(session=session)
        self.assertEqual(bill.overage_minutes, 60)
        self.assertEqual(bill.amount, Decimal('100.00'))
        self.assertEqual(session.calculated_charge, Decimal('0.00'))


class NightPricingSettingsAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_user(email='admin@example.com', password='testpass123')
        user.groups.add(Group.objects.get(name=SUPERADMIN))
        self.client.force_authenticate(user=user)

    def test_night_window_is_readable_and_editable(self):
        res = self.client.get('/api/v1/parking/configuration/')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.content)
        self.assertEqual(res.data['night_start'], '22:00:00')
        self.assertTrue(res.data['night_pricing_enabled'])

        res = self.client.patch('/api/v1/parking/configuration/',
                                {'night_start': '21:00', 'night_end': '05:30'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.content)
        self.assertEqual(ParkingConfiguration.get_solo().night_start, time(21, 0))

    def test_night_boundary_grace_is_readable_and_editable(self):
        res = self.client.get('/api/v1/parking/configuration/')
        self.assertEqual(res.data['night_morning_grace_minutes'], 15)
        self.assertEqual(res.data['night_evening_grace_minutes'], 15)

        res = self.client.patch('/api/v1/parking/configuration/',
                                {'night_morning_grace_minutes': 30, 'night_evening_grace_minutes': 10},
                                format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.content)
        config = ParkingConfiguration.get_solo()
        self.assertEqual((config.night_morning_grace_minutes, config.night_evening_grace_minutes), (30, 10))

    def test_negative_night_boundary_grace_is_rejected(self):
        res = self.client.patch('/api/v1/parking/configuration/',
                                {'night_morning_grace_minutes': -1}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_equal_night_start_and_end_is_rejected(self):
        res = self.client.patch('/api/v1/parking/configuration/',
                                {'night_start': '06:00', 'night_end': '06:00'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_negative_night_rate_is_rejected(self):
        plan = PricingPlan.objects.create(name='P', rate_details={'rate_per_hour': '10'})
        res = self.client.patch(f'/api/v1/parking/pricing-plans/{plan.pk}',
                                {'night_rate_per_hour': '-5'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class ParkingRatesAPITests(TestCase):
    """GET /parking/rates — the POS rate card's day/night rates and window."""

    def setUp(self):
        self.client = APIClient()
        self.car = make_vehicle_type('4 wheelers', free_duration_minutes=10, rate_per_hour='60.00')
        self.car.pricing_plan.night_rate_per_hour = Decimal('100.00')
        self.car.pricing_plan.minimum_charge = Decimal('30.00')
        self.car.pricing_plan.save()

    def test_pos_user_reads_rates_and_night_window(self):
        self.client.force_authenticate(user=make_pos_user('pos-rates@example.com'))
        res = self.client.get('/api/v1/parking/rates')

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.content)
        self.assertEqual(res.data['night_start'], time(22, 0))
        self.assertEqual(res.data['night_end'], time(6, 0))
        self.assertEqual(res.data['time_zone'], 'Asia/Kathmandu')
        self.assertTrue(res.data['night_pricing_enabled'])
        [car] = res.data['vehicle_types']
        self.assertEqual(car['name'], '4 wheelers')
        self.assertEqual(car['pricing_plan']['night_rate_per_hour'], '100.00')
        self.assertEqual(car['pricing_plan']['rate_details'], {'rate_per_hour': '60.00'})

    def test_rates_need_a_pos_role(self):
        self.client.force_authenticate(
            user=User.objects.create_user(email='nobody@example.com', password='x'))
        res = self.client.get('/api/v1/parking/rates')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class RFIDGateTests(TestCase):
    """
    One booth reader, one tap = toggle. See management/rfid.py.
    Cooldown is exercised by ageing the stored timestamps rather than
    sleeping — all times come from the server clock.
    """

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=make_pos_user('booth@example.com'))
        self.vehicle_type = make_vehicle_type()
        self.vendor = make_vendor()
        self.staff = make_staff(company=self.vendor, vehicle_type=self.vehicle_type)
        self.card = RFIDCard.objects.create(uid='0012345678', staff=self.staff)
        self.pass_ = ParkingPass.objects.create(
            staff=self.staff,
            valid_from=timezone.now() - timedelta(days=10),
            valid_until=timezone.now() + timedelta(days=20),
        )

    def tap(self, uid='0012345678'):
        return self.client.post('/api/v1/parking/rfid-tap', {'uid': uid}, format='json')

    def force_entry(self, uid='0012345678', session_id=None):
        data = {'uid': uid}
        if session_id:
            data['session_id'] = session_id
        return self.client.post('/api/v1/parking/rfid-force-entry', data, format='json')

    def age(self, seconds=11):
        """Pretend every recorded event happened `seconds` earlier."""
        delta = timedelta(seconds=seconds)
        ParkingSession.objects.update(entry_time=F('entry_time') - delta)
        ParkingSession.objects.filter(exit_time__isnull=False).update(exit_time=F('exit_time') - delta)

    def expire_subscription(self):
        self.pass_.valid_until = timezone.now() - timedelta(days=1)
        self.pass_.save()

    def test_taps_toggle_entry_exit_entry(self):
        first = self.tap()
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(first.data['status'], 'entry')
        self.assertEqual(first.data['tenant_name'], self.staff.name)
        self.assertIsNotNone(first.data['entry_time'])

        self.age()
        second = self.tap()
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data['status'], 'exit')
        self.assertEqual(second.data['session_id'], first.data['session_id'])
        self.assertIsNotNone(second.data['exit_time'])
        self.assertGreaterEqual(second.data['duration_minutes'], 0)

        self.age()
        third = self.tap()
        self.assertEqual(third.data['status'], 'entry')
        self.assertNotEqual(third.data['session_id'], first.data['session_id'])

        self.assertEqual(ParkingSession.objects.filter(rfid_card=self.card).count(), 2)
        self.assertEqual(
            ParkingSession.objects.filter(rfid_card=self.card, exit_time__isnull=True).count(), 1)

    def test_double_tap_within_cooldown_is_ignored(self):
        self.tap()
        again = self.tap()
        self.assertEqual(again.status_code, status.HTTP_200_OK)
        self.assertEqual(again.data['status'], 'ignored_duplicate')
        session = ParkingSession.objects.get(rfid_card=self.card)
        self.assertIsNone(session.exit_time)

        # Same after an exit: a lingering card must not re-enter.
        self.age()
        self.assertEqual(self.tap().data['status'], 'exit')
        self.assertEqual(self.tap().data['status'], 'ignored_duplicate')
        self.assertEqual(ParkingSession.objects.filter(rfid_card=self.card).count(), 1)

    def test_unknown_card_is_rejected(self):
        resp = self.tap('9999999999')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resp.data['status'], 'unknown_card')
        self.assertFalse(ParkingSession.objects.exists())

    def test_inactive_card_is_rejected(self):
        self.card.is_active = False
        self.card.save()
        resp = self.tap()
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(resp.data['status'], 'unknown_card')
        self.assertFalse(ParkingSession.objects.exists())

    def test_entry_with_expired_subscription_is_rejected(self):
        self.expire_subscription()
        resp = self.tap()
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data['status'], 'subscription_expired')
        self.assertFalse(ParkingSession.objects.exists())

    def test_subscription_via_extra_vehicle_allows_entry(self):
        # The shared ParkingPass.active_for_staff check covers extra vehicles too.
        other = make_staff(company=self.vendor, vehicle_type=self.vehicle_type,
                           license_plate='BA-2-PA-9999', name='Second Car')
        self.pass_.extra_vehicles.add(other)
        RFIDCard.objects.create(uid='0087654321', staff=other)
        self.assertEqual(self.tap('0087654321').data['status'], 'entry')

    def test_exit_allowed_after_subscription_expired(self):
        self.tap()
        self.expire_subscription()
        self.age()
        resp = self.tap()
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['status'], 'exit')
        self.assertIsNotNone(ParkingSession.objects.get(rfid_card=self.card).exit_time)

    def test_force_entry_closes_open_session_as_auto_closed(self):
        stale = self.tap().data['session_id']
        resp = self.force_entry()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['status'], 'entry')
        self.assertEqual(resp.data['auto_closed_session_id'], stale)

        old = ParkingSession.objects.get(pk=stale)
        self.assertTrue(old.auto_closed)
        self.assertIsNotNone(old.exit_time)
        new = ParkingSession.objects.get(pk=resp.data['session_id'])
        self.assertFalse(new.auto_closed)
        self.assertIsNone(new.exit_time)

    def test_force_entry_corrects_the_exit_just_shown(self):
        # Tenant left yesterday without tapping; today's arrival tap closed
        # the stale session as an EXIT. The operator hits "Wrong — mark as Entry".
        entry = self.tap().data['session_id']
        self.age(60 * 60 * 20)
        exit_resp = self.tap()
        self.assertEqual(exit_resp.data['status'], 'exit')

        resp = self.force_entry(session_id=exit_resp.data['session_id'])
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        wrong = ParkingSession.objects.get(pk=entry)
        self.assertTrue(wrong.auto_closed)
        self.assertEqual(wrong.calculated_charge, Decimal('0.00'))
        self.assertIsNone(ParkingSession.objects.get(pk=resp.data['session_id']).exit_time)

    def test_force_entry_rejects_a_correction_that_is_no_longer_latest(self):
        first = self.tap().data['session_id']
        self.age()
        self.tap()   # exit
        self.age()
        self.tap()   # a real new entry since
        self.age()
        self.tap()   # and its exit
        resp = self.force_entry(session_id=first)
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(ParkingSession.objects.filter(auto_closed=True).exists())

    def test_force_entry_still_enforces_subscription(self):
        stale = self.tap().data['session_id']
        self.expire_subscription()
        resp = self.force_entry()
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data['status'], 'subscription_expired')
        # All-or-nothing: the open session was not touched.
        self.assertFalse(ParkingSession.objects.get(pk=stale).auto_closed)
        self.assertEqual(ParkingSession.objects.count(), 1)

    def test_rfid_endpoints_require_pos_role(self):
        anon = APIClient()
        self.assertIn(anon.post('/api/v1/parking/rfid-tap', {'uid': '0012345678'}).status_code,
                      (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        no_role = APIClient()
        no_role.force_authenticate(user=User.objects.create_user(email='nobody@example.com', password='x'))
        self.assertEqual(
            no_role.post('/api/v1/parking/rfid-force-entry', {'uid': '0012345678'}).status_code,
            status.HTTP_403_FORBIDDEN)

    def test_db_allows_only_one_open_session_per_card(self):
        make = lambda: ParkingSession.objects.create(
            vehicle_type=self.vehicle_type, registered_staff_member=self.staff, rfid_card=self.card)
        make()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                make()
        # A closed session doesn't count.
        ParkingSession.objects.update(exit_time=timezone.now())
        make()

    def test_valid_excludes_auto_closed_from_durations(self):
        now = timezone.now()
        base = dict(vehicle_type=self.vehicle_type, registered_staff_member=self.staff)
        ParkingSession.objects.create(entry_time=now - timedelta(minutes=30), exit_time=now, **base)
        ParkingSession.objects.create(entry_time=now - timedelta(hours=20), exit_time=now,
                                      auto_closed=True, **base)

        def total_minutes(qs):
            return sum(int((s.exit_time - s.entry_time).total_seconds() // 60) for s in qs)

        self.assertEqual(total_minutes(ParkingSession.objects.valid()), 30)
        self.assertEqual(total_minutes(ParkingSession.objects.all()), 30 + 20 * 60)

        today = self.client.get('/api/v1/parking/rfid-today').data
        self.assertEqual(today['completed_minutes'], 30)
        auto = [r for r in today['sessions'] if r['auto_closed']]
        self.assertEqual(len(auto), 1)
        self.assertIsNone(auto[0]['duration_minutes'])

    def test_today_view_lists_currently_parked_first(self):
        self.tap()
        self.age()
        self.tap()                                    # closed today
        other = make_staff(company=self.vendor, vehicle_type=self.vehicle_type,
                           license_plate='BA-3-PA-1111', name='Parked Now')
        self.pass_.extra_vehicles.add(other)
        RFIDCard.objects.create(uid='0011111111', staff=other)
        self.tap('0011111111')                        # still parked

        data = self.client.get('/api/v1/parking/rfid-today').data
        self.assertEqual(data['currently_parked'], 1)
        self.assertEqual(data['sessions'][0]['tenant_name'], 'Parked Now')
        self.assertTrue(data['sessions'][0]['is_open'])
        self.assertFalse(data['sessions'][1]['is_open'])

    def test_timestamps_are_timezone_aware(self):
        self.tap()
        self.age()
        self.tap()
        session = ParkingSession.objects.get(rfid_card=self.card)
        self.assertTrue(timezone.is_aware(session.entry_time))
        self.assertTrue(timezone.is_aware(session.exit_time))
        self.assertEqual(str(timezone.get_current_timezone()), 'Asia/Kathmandu')


    def lookup(self, uid='0012345678'):
        return self.client.get('/api/v1/parking/rfid-lookup', {'uid': uid})

    def test_lookup_identifies_holder_without_touching_the_gate(self):
        data = self.lookup(' 0012345678 ').data
        self.assertTrue(data['found'])
        self.assertEqual(data['tenant']['name'], self.staff.name)
        self.assertEqual(data['tenant']['license_plate'], self.staff.license_plate)
        self.assertTrue(data['subscription']['active'])
        self.assertIsNone(data['parked_since'])
        self.assertFalse(ParkingSession.objects.exists())
        self.assertFalse(CardScanLog.objects.exists())

    def test_lookup_finds_deactivated_cards_and_reports_parked(self):
        self.tap()
        self.card.is_active = False
        self.card.save()
        data = self.lookup().data
        self.assertTrue(data['found'])
        self.assertFalse(data['card']['is_active'])
        self.assertIsNotNone(data['parked_since'])
        self.assertIsNotNone(data['card']['last_used'])

    def test_lookup_unknown_card(self):
        data = self.lookup('0000000001').data
        self.assertEqual(data, {'found': False, 'uid': '0000000001'})
        self.assertEqual(self.client.get('/api/v1/parking/rfid-lookup').status_code,
                         status.HTTP_400_BAD_REQUEST)


class RFIDCardAPITests(TestCase):
    """The tenant detail card reads a member's RFID cards from /staff and
    blocks/unblocks one through /rfid-cards/<id>."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(email='desk-admin@example.com', password='testpass123')
        self.admin.groups.add(Group.objects.get(name=ADMIN))
        self.client.force_authenticate(user=self.admin)
        self.vehicle_type = make_vehicle_type()
        self.vendor = make_vendor()
        self.staff = make_staff(company=self.vendor, vehicle_type=self.vehicle_type)
        self.card = RFIDCard.objects.create(uid='0012345678', staff=self.staff)

    def member_payload(self, staff=None):
        staff = staff or self.staff
        return self.client.get(f'/api/v1/parking/staff/{staff.pk}').data

    def test_staff_payload_lists_cards_newest_first_with_leading_zeros(self):
        newer = RFIDCard.objects.create(uid='0099999999', staff=self.staff, is_active=False)
        cards = self.member_payload()['rfid_cards']
        self.assertEqual([c['uid'] for c in cards], ['0099999999', '0012345678'])
        self.assertEqual(cards[0]['id'], newer.pk)
        self.assertFalse(cards[0]['is_active'])
        self.assertTrue(cards[1]['is_active'])

    def test_member_without_a_card_gets_an_empty_list(self):
        other = make_staff(company=self.vendor, vehicle_type=self.vehicle_type,
                           license_plate='BA-2-PA-0001', name='No Card')
        self.assertEqual(self.member_payload(other)['rfid_cards'], [])

    def test_staff_list_does_not_query_per_member(self):
        for i in range(5):
            member = make_staff(company=self.vendor, vehicle_type=self.vehicle_type,
                                license_plate=f'BA-9-PA-{i:04d}', name=f'Member {i}')
            RFIDCard.objects.create(uid=f'00000000{i:02d}', staff=member)
        # Only the RFID lookups are pinned: company/vehicle_type are resolved
        # per member by StaffSerializer already, which is not this test's concern.
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/v1/parking/staff')
        self.assertEqual(len(response.data), 6)
        card_queries = [q for q in queries.captured_queries if 'management_rfidcard' in q['sql']]
        self.assertEqual(len(card_queries), 1)

    def test_parking_passes_payload_carries_no_card_uids(self):
        ParkingPass.objects.create(
            staff=self.staff,
            valid_from=timezone.now() - timedelta(days=1),
            valid_until=timezone.now() + timedelta(days=29),
        )
        payload = self.client.get('/api/v1/parking/parking-passes').data
        self.assertNotIn('rfid_cards', payload[0]['staff'])

    def test_deactivating_a_card_blocks_it_at_the_gate(self):
        ParkingPass.objects.create(
            staff=self.staff,
            valid_from=timezone.now() - timedelta(days=1),
            valid_until=timezone.now() + timedelta(days=29),
        )
        admitted = self.client.post('/api/v1/parking/rfid-tap', {'uid': '0012345678'}, format='json')
        self.assertEqual(admitted.data['status'], 'entry')

        response = self.client.patch(f'/api/v1/parking/rfid-cards/{self.card.pk}', {'is_active': False}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_active'])
        self.card.refresh_from_db()
        self.assertFalse(self.card.is_active)

        tap = self.client.post('/api/v1/parking/rfid-tap', {'uid': '0012345678'}, format='json')
        self.assertEqual(tap.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(tap.data['status'], 'unknown_card')

    def test_only_is_active_is_writable(self):
        other = make_staff(company=self.vendor, vehicle_type=self.vehicle_type,
                           license_plate='BA-2-PA-0002', name='Someone Else')
        response = self.client.patch(
            f'/api/v1/parking/rfid-cards/{self.card.pk}',
            {'uid': '0000000000', 'staff': other.pk, 'is_active': True}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.card.refresh_from_db()
        self.assertEqual(self.card.uid, '0012345678')
        self.assertEqual(self.card.staff_id, self.staff.pk)

    def test_card_endpoint_cannot_read_or_delete(self):
        url = f'/api/v1/parking/rfid-cards/{self.card.pk}'
        self.assertEqual(self.client.get(url).status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(self.client.get('/api/v1/parking/rfid-cards').status_code,
                         status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(RFIDCard.objects.filter(pk=self.card.pk).exists())

    def issue(self, uid, staff=None, client=None):
        return (client or self.client).post(
            '/api/v1/parking/rfid-cards', {'uid': uid, 'staff': (staff or self.staff).pk}, format='json')

    def test_issue_a_card_to_a_member_without_one(self):
        other = make_staff(company=self.vendor, vehicle_type=self.vehicle_type,
                           license_plate='BA-2-PA-0003', name='Needs A Card')
        response = self.issue('0087654321', staff=other)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['uid'], '0087654321')       # leading zeros survive
        self.assertTrue(response.data['is_active'])
        card = RFIDCard.objects.get(uid='0087654321')
        self.assertEqual(card.staff_id, other.pk)
        self.assertEqual([c['uid'] for c in self.member_payload(other)['rfid_cards']], ['0087654321'])

    def test_a_new_card_is_listed_before_the_older_one(self):
        self.issue('0087654321')
        self.assertEqual([c['uid'] for c in self.member_payload()['rfid_cards']],
                         ['0087654321', '0012345678'])

    def test_a_card_issued_through_the_api_works_at_the_gate(self):
        ParkingPass.objects.create(
            staff=self.staff,
            valid_from=timezone.now() - timedelta(days=1),
            valid_until=timezone.now() + timedelta(days=29),
        )
        self.issue('0087654321')
        tap = self.client.post('/api/v1/parking/rfid-tap', {'uid': '0087654321'}, format='json')
        self.assertEqual(tap.data['status'], 'entry')

    def test_uid_is_trimmed(self):
        response = self.issue('  0087654321 ')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['uid'], '0087654321')

    def test_duplicate_uid_names_the_current_holder(self):
        other = make_staff(company=self.vendor, vehicle_type=self.vehicle_type,
                           license_plate='BA-2-PA-0004', name='Second Member')
        response = self.issue('0012345678', staff=other)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        message = response.data['uid'][0]
        self.assertIn(self.staff.name, message)
        self.assertIn(self.staff.license_plate, message)
        self.assertEqual(RFIDCard.objects.filter(uid='0012345678').count(), 1)

    def test_uid_must_be_letters_and_digits_only(self):
        for bad in ('0012 3456', '00-123456', ''):
            response = self.issue(bad)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, bad)
            self.assertIn('uid', response.data)
        self.assertEqual(RFIDCard.objects.count(), 1)

    def test_issue_needs_a_real_member(self):
        response = self.client.post('/api/v1/parking/rfid-cards', {'uid': '0087654321', 'staff': 999999}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('staff', response.data)

    def test_cannot_force_a_new_card_inactive_or_reassign_on_issue(self):
        response = self.client.post(
            '/api/v1/parking/rfid-cards',
            {'uid': '0087654321', 'staff': self.staff.pk, 'is_active': False}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['is_active'])

    def test_pos_role_cannot_issue_a_card(self):
        response = self.issue('0087654321', client=self._pos_client())
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(RFIDCard.objects.count(), 1)

    def _pos_client(self):
        client = APIClient()
        client.force_authenticate(user=make_pos_user('booth3@example.com'))
        return client

    def test_pos_role_cannot_toggle_a_card(self):
        self.client.force_authenticate(user=make_pos_user('booth2@example.com'))
        response = self.client.patch(f'/api/v1/parking/rfid-cards/{self.card.pk}', {'is_active': False}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.card.refresh_from_db()
        self.assertTrue(self.card.is_active)


class ParkingPassRenewTests(TestCase):
    def setUp(self):
        self.vendor = make_vendor()
        self.staff = make_staff(company=self.vendor, vehicle_type=make_vehicle_type())
        self.extra = make_staff(company=self.vendor, license_plate='BA-2-PA-5678', name='Second Car')
        self.card = RFIDCard.objects.create(uid='0012345678', staff=self.staff)

    def make_pass(self, valid_from, valid_until):
        pass_ = ParkingPass.objects.create(
            staff=self.staff, valid_from=valid_from, valid_until=valid_until,
            price_paid=Decimal('3000.00'), payment_method='BANK_TRANSFER',
        )
        pass_.extra_vehicles.add(self.extra)
        return pass_

    def test_renewal_starts_where_current_pass_ends_and_copies_terms(self):
        tz = timezone.get_current_timezone()
        start = timezone.datetime(2026, 1, 31, 9, 0, tzinfo=tz)
        old = self.make_pass(start - timedelta(days=31), start)
        new = old.renew(now=start - timedelta(days=3))
        self.assertEqual(new.valid_from, start)
        # Calendar month, clamped: Jan 31 -> Feb 28.
        self.assertEqual(timezone.localtime(new.valid_until).date(), timezone.datetime(2026, 2, 28).date())
        self.assertEqual(new.price_paid, Decimal('3000.00'))
        self.assertEqual(new.payment_method, 'BANK_TRANSFER')
        self.assertEqual(list(new.extra_vehicles.all()), [self.extra])
        self.assertEqual(old.renewal(), new)

    def test_lapsed_pass_renews_from_now_and_reopens_rfid_gate(self):
        now = timezone.now()
        old = self.make_pass(now - timedelta(days=40), now - timedelta(days=10))
        self.assertIsNone(ParkingPass.active_for_staff(self.staff))
        new = old.renew(now=now)
        self.assertEqual(new.valid_from, now)
        # The card itself is untouched — the gate check now finds the new pass.
        self.assertEqual(ParkingPass.active_for_staff(self.card.staff), new)
        self.assertEqual(ParkingPass.active_for_staff(self.extra), new)

    def test_quarterly_pass_renews_for_three_months(self):
        tz = timezone.get_current_timezone()
        start = timezone.datetime(2026, 3, 1, tzinfo=tz)
        old = self.make_pass(start - timedelta(days=90), start)
        new = old.renew(now=start)
        self.assertEqual(timezone.localtime(new.valid_until).date(), timezone.datetime(2026, 6, 1).date())


class ParkingPassAdminTests(TestCase):
    def setUp(self):
        self.client.force_login(User.objects.create_superuser(email='admin@example.com', password='x'))
        self.staff = make_staff(company=make_vendor(), vehicle_type=make_vehicle_type())
        RFIDCard.objects.create(uid='0012345678', staff=self.staff)
        now = timezone.now()
        self.pass_ = ParkingPass.objects.create(
            staff=self.staff, valid_from=now - timedelta(days=40), valid_until=now - timedelta(days=10))

    def test_change_form_lists_holder_rfid_cards(self):
        response = self.client.get(f'/admin/management/parkingpass/{self.pass_.pk}/change/')
        self.assertContains(response, '0012345678')
        self.assertContains(response, 'cards are refused at the gate')

    def test_renew_action_is_idempotent(self):
        data = {'action': 'renew_passes', '_selected_action': [self.pass_.pk]}
        self.client.post('/admin/management/parkingpass/', data)
        self.client.post('/admin/management/parkingpass/', data)
        self.assertEqual(ParkingPass.objects.filter(staff=self.staff).count(), 2)
        self.assertIsNotNone(ParkingPass.active_for_staff(self.staff))


class GlobalSearchAPITests(TestCase):
    """GET /search powers the frontend ⌘K palette: one query across entities,
    with groups trimmed to what the caller's role can already see."""

    URL = '/api/v1/parking/search'

    def setUp(self):
        self.vehicle_type = make_vehicle_type(name='Sedan')
        self.vendor = make_vendor(name='Acme Traders')
        self.staff = make_staff(company=self.vendor, vehicle_type=self.vehicle_type,
                                license_plate='BA-9-PA-4242', name='Ram Sharma')
        RFIDCard.objects.create(uid='0077665544', staff=self.staff)
        self.session = make_session(self.vehicle_type, license_plate='BA-9-PA-4242')
        now = timezone.now()
        ParkingPass.objects.create(staff=self.staff, valid_from=now, valid_until=now + timedelta(days=30))

    def search(self, user, q):
        client = APIClient()
        if user:
            client.force_authenticate(user=user)
        return client.get(self.URL, {'q': q})

    def user_with(self, role, email):
        user = User.objects.create_user(email=email, password='x')
        user.groups.add(Group.objects.get(name=role))
        return user

    def types(self, response):
        return {r['type'] for r in response.data['results']}

    def test_requires_a_role(self):
        self.assertIn(self.search(None, 'BA-9').status_code,
                      (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_short_query_returns_nothing(self):
        response = self.search(make_pos_user('pos@example.com'), 'B')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['results'], [])

    def test_pos_sees_gate_data_but_not_back_office_groups(self):
        response = self.search(make_pos_user('pos@example.com'), '4242')
        self.assertEqual(self.types(response), {'session', 'member'})
        self.assertNotIn('pass', self.types(self.search(make_pos_user('pos2@example.com'), 'Ram')))

    def test_admin_sees_passes_and_settings_but_not_operators(self):
        admin = self.user_with(ADMIN, 'admin@example.com')
        self.assertIn('pass', self.types(self.search(admin, '4242')))
        self.assertIn('vehicle_type', self.types(self.search(admin, 'Sedan')))
        self.assertIn('pricing_plan', self.types(self.search(admin, 'Sedan Plan')))
        self.assertNotIn('operator', self.types(self.search(admin, 'admin@')))

    def test_superadmin_sees_operators(self):
        superadmin = self.user_with(SUPERADMIN, 'boss@example.com')
        self.assertIn('operator', self.types(self.search(superadmin, 'boss@')))

    def test_ticket_number_match(self):
        response = self.search(make_pos_user('pos@example.com'), self.session.ticket_number)
        session_hits = [r for r in response.data['results'] if r['type'] == 'session']
        self.assertEqual(session_hits[0]['id'], str(self.session.id))
        self.assertEqual(session_hits[0]['meta']['ticket_number'], self.session.ticket_number)

    def test_rfid_uid_finds_member_once(self):
        RFIDCard.objects.create(uid='0077665599', staff=self.staff, is_active=False)
        response = self.search(make_pos_user('pos@example.com'), '00776655')
        members = [r for r in response.data['results'] if r['type'] == 'member']
        self.assertEqual(len(members), 1)
        self.assertEqual(members[0]['meta']['vendor_id'], self.vendor.id)

    def test_tenant_name_match(self):
        response = self.search(make_pos_user('pos@example.com'), 'acme')
        self.assertIn('tenant', self.types(response))


class LostTicketAPITests(TestCase):
    """
    POST sessions/<ticket>/mark-lost — the customer lost their ticket: the
    session closes now at the flat ParkingConfiguration.lost_ticket_fine,
    whatever the parking fee would have been, and is paid via mark-paid.
    """

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=make_pos_user('pos@example.com'))
        self.vehicle_type = make_vehicle_type()

    def _post(self, session, action, data=None):
        return self.client.post(
            f'/api/v1/parking/sessions/{session.ticket_number}/{action}', data or {}, format='json')

    def test_long_stay_is_closed_at_the_flat_fine(self):
        # 10h at 60/hr would be 600; a lost ticket pays the fine only.
        session = make_session(self.vehicle_type, entry_minutes_ago=600)
        response = self._post(session, 'mark-lost')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['lost_ticket'])
        self.assertEqual(response.data['calculated_charge'], '100.00')
        session.refresh_from_db()
        self.assertEqual(session.status, 'COMPLETED')
        self.assertIsNotNone(session.exit_time)
        self.assertIn('Lost ticket', session.notes)

    def test_fine_is_paid_like_any_bill(self):
        session = make_session(self.vehicle_type, entry_minutes_ago=30)
        self._post(session, 'mark-lost')
        response = self._post(session, 'mark-paid', {'payment_method': 'CASH'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        session.refresh_from_db()
        self.assertEqual(session.status, 'PAID')
        self.assertEqual(session.calculated_charge, Decimal('100.00'))

    def test_fine_comes_from_configuration(self):
        config = ParkingConfiguration.get_solo()
        config.lost_ticket_fine = Decimal('150.00')
        config.save()
        session = make_session(self.vehicle_type, entry_minutes_ago=5)

        self.assertEqual(self._post(session, 'mark-lost').data['calculated_charge'], '150.00')

    def test_rescanning_or_a_coupon_does_not_reprice_the_fine(self):
        session = make_session(self.vehicle_type, entry_minutes_ago=600)
        exit_time = self._post(session, 'mark-lost').data['exit_time']
        rescan = self._post(session, 'calculate-charge')
        coupon = Coupon.objects.create(
            code='LOSTFREE', validation_type='FREE_MINUTES', value_minutes=600, max_uses=1)
        self._post(session, 'apply-coupon', {'coupon_code': coupon.code})

        self.assertEqual(rescan.data['exit_time'], exit_time)
        session.refresh_from_db()
        self.assertEqual(session.calculated_charge, Decimal('100.00'))

    def test_stamped_ticket_drops_its_tenant_bill(self):
        vendor = make_vendor(stamp_free_minutes=60)
        session = make_session(self.vehicle_type, entry_minutes_ago=180)
        session.add_stamp(vendor)
        self._post(session, 'calculate-charge')
        self.assertTrue(TenantBill.objects.filter(session=session).exists())
        session.exit_time = None
        session.status = 'ACTIVE'
        session.save()

        self._post(session, 'mark-lost')
        self.client.get(f'/api/v1/parking/sessions/{session.ticket_number}')

        session.refresh_from_db()
        self.assertFalse(TenantBill.objects.filter(session=session).exists())
        self.assertEqual(session.calculated_charge, Decimal('100.00'))

    def test_already_paid_ticket_is_rejected(self):
        session = make_session(self.vehicle_type, entry_minutes_ago=30)
        self._post(session, 'calculate-charge')
        self._post(session, 'mark-paid', {'payment_method': 'CASH'})
        response = self._post(session, 'mark-lost')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already closed', response.data['error'])

    def test_unknown_ticket_is_404(self):
        response = self.client.post('/api/v1/parking/sessions/TI20260101-99999/mark-lost')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def _lookup(self, q):
        return self.client.get('/api/v1/parking/sessions/open-lookup', {'q': q})

    def test_lookup_by_plate_ignores_spaces_and_case(self):
        session = make_session(self.vehicle_type, entry_minutes_ago=30, license_plate='BA 1 PA 8342')
        make_session(self.vehicle_type, entry_minutes_ago=30, license_plate='BA 2 KHA 1111')

        for q in ('8342', 'ba1pa8342', 'BA 1 PA 83'):
            response = self._lookup(q)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual([s['ticket_number'] for s in response.data], [session.ticket_number], q)

    def test_lookup_by_ticket_number(self):
        session = make_session(self.vehicle_type, entry_minutes_ago=30, license_plate='7813')

        response = self._lookup(session.ticket_number.lower())

        self.assertEqual([s['id'] for s in response.data], [str(session.id)])

    def test_lookup_skips_paid_and_already_lost_sessions(self):
        paid = make_session(self.vehicle_type, entry_minutes_ago=30, license_plate='5555')
        self._post(paid, 'calculate-charge')
        self._post(paid, 'mark-paid', {'payment_method': 'CASH'})
        lost = make_session(self.vehicle_type, entry_minutes_ago=30, license_plate='5555')
        self._post(lost, 'mark-lost')
        parked = make_session(self.vehicle_type, entry_minutes_ago=30, license_plate='5555')

        self.assertEqual([s['ticket_number'] for s in self._lookup('5555').data], [parked.ticket_number])

    def test_lookup_needs_two_characters(self):
        make_session(self.vehicle_type, entry_minutes_ago=30, license_plate='5555')

        self.assertEqual(self._lookup('5').data, [])
