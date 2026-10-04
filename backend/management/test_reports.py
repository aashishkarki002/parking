from datetime import timedelta

from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from management.models import ParkingPass, ParkingSession, TicketStamp
from management.tests import make_pos_user, make_session, make_staff, make_vehicle_type, make_vendor


def iso(dt):
    return dt.isoformat()


class ServerSideReportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=make_pos_user('reports@example.com'))
        self.car = make_vehicle_type('Car', rate_per_hour='60.00')
        self.bike = make_vehicle_type('Motorcycle', rate_per_hour='20.00')
        self.vendor = make_vendor('Cafe')
        self.now = timezone.now()

        # Paid two-hour car visit.
        paid = make_session(self.car, entry_minutes_ago=180, license_plate='BA 1 PA 1')
        paid.exit_time = paid.entry_time + timedelta(hours=2)
        paid.save()
        paid.calculated_charge = paid.undiscounted_charge
        paid.status, paid.payment_method = 'PAID', 'CASH'
        paid.save()

        # Stamped guest bike, still parked.
        self.guest = make_session(self.bike, entry_minutes_ago=30, license_plate='BA 2 PA 2')
        TicketStamp.objects.create(session=self.guest, vendor=self.vendor, free_minutes_granted=60)

        # Unpaid exit.
        unpaid = make_session(self.car, entry_minutes_ago=90, license_plate='BA 3 PA 3')
        unpaid.exit_time = unpaid.entry_time + timedelta(minutes=60)
        unpaid.save()
        unpaid.calculated_charge, unpaid.status = 60, 'COMPLETED'
        unpaid.save()

    def test_report_summary(self):
        start, end = self.now - timedelta(days=1), self.now + timedelta(hours=1)
        edges = ','.join(iso(start + timedelta(hours=h)) for h in range(0, 26, 1))
        res = self.client.get('/api/v1/parking/reports/summary', {
            'start': iso(start), 'end': iso(end),
            'prev_start': iso(start - timedelta(days=1)), 'prev_end': iso(start),
            'edges': edges,
        })
        self.assertEqual(res.status_code, 200, res.content)
        current = res.data['current']
        self.assertEqual(current['sessions'], 3)
        self.assertEqual(current['exited'], 2)
        self.assertEqual(current['stillParked'], 1)
        self.assertEqual(current['sessionsValidated'], 1)
        # Like metrics.ts, an unpaid charge has no method, so it lands under cash.
        self.assertEqual(current['cashCollected'], 180.0)
        self.assertEqual(current['unpaidValue'], 60.0)
        self.assertEqual(current['tenants'][0]['vendor'], 'Cafe')
        self.assertEqual(res.data['previous']['sessions'], 0)
        self.assertEqual(sum(res.data['traffic']['all']['arrivals']), 3)
        self.assertEqual(res.data['traffic']['two']['sessions'], 1)
        self.assertEqual(res.data['traffic']['four']['sessions'], 2)

    def test_sessions_table_filters_and_pages(self):
        res = self.client.get('/api/v1/parking/sessions-table', {'payment': 'UNPAID'})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(res.data['results'][0]['license_plate'], 'BA 3 PA 3')

        res = self.client.get('/api/v1/parking/sessions-table', {'page_size': 2, 'page': 2})
        self.assertEqual(res.data['count'], 3)
        self.assertEqual(len(res.data['results']), 1)

        res = self.client.get('/api/v1/parking/sessions-table', {'plate': 'ba-2-pa-2'})
        self.assertEqual([r['license_plate'] for r in res.data['results']], ['BA 2 PA 2'])

    def test_sessions_table_query_count_is_flat(self):
        for i in range(5):
            make_session(self.car, license_plate=f'X {i}')
        with CaptureQueriesContext(connection) as ctx:
            self.client.get('/api/v1/parking/sessions-table', {'page_size': 50})
        self.assertLess(len(ctx), 10)

    def test_sessions_overview(self):
        day_start = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
        res = self.client.get('/api/v1/parking/sessions-table/overview', {'day_start': iso(day_start)})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.data['tabCounts']['ALL'], 3)
        self.assertEqual(res.data['stats']['activeCount'], 1)
        self.assertEqual(res.data['stats']['unsettledTotal'], 60.0)
        self.assertEqual(res.data['parkedMix'], [['Motorcycle', 1]])

    def test_statements(self):
        res = self.client.get('/api/v1/parking/statements/visits')
        self.assertEqual([v['id'] for v in res.data], [str(self.guest.pk)])
        self.assertEqual(res.data[0]['stamps'][0]['vendor'], 'Cafe')
        res = self.client.get('/api/v1/parking/statements/months')
        self.assertEqual(res.data, [timezone.localtime(self.guest.entry_time).strftime('%Y-%m')])

    def test_lapsed_pass_usage(self):
        staff = make_staff(self.vendor, self.car, license_plate='BA 9 PA 9', name='Late Payer')
        lapsed = ParkingPass.objects.create(
            staff=staff, valid_from=self.now - timedelta(days=40),
            valid_until=self.now - timedelta(days=10), price_paid=5000,
        )
        visit = make_session(self.car, entry_minutes_ago=60, license_plate='BA 9 PA 9')
        ParkingSession.objects.filter(pk=visit.pk).update(status='COMPLETED', calculated_charge=60)
        res = self.client.get('/api/v1/parking/pass-lapsed-usage')
        self.assertEqual(res.data, [{'pass_id': lapsed.pk, 'sessions_count': 1, 'unbilled': 60.0}])
