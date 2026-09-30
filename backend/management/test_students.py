import io
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from user_app.models import User
from user_app.roles import ADMIN, POS, TENANT
from management.models import ParkingConfiguration, ParkingSession, Student, StudentRequest
from management.student_import import normalize_rows, parse_days, read_upload
from management.tests import make_pos_user, make_staff, make_vehicle_type, make_vendor

TODAY = timezone.localdate()
HEADER = 'S.N,Batch Start Date,Batch End Date,Class Days,Class Time From,Class Time To,' \
         'Student Name,Contact Number,Vehicle No,Vehicle Type,Status\n'


def make_user(email, role, vendor=None):
    user = User.objects.create_user(email=email, password='testpass123', vendor=vendor)
    user.groups.add(Group.objects.get(name=role))
    return user


def make_student(vendor, plate='BA2PA1111', review_status=Student.APPROVED, vehicle_type=None,
                 start=None, end=None, is_active=True, name='Sita'):
    request = StudentRequest.objects.create(vendor=vendor)
    return Student.objects.create(
        request=request, vendor=vendor, name=name, license_plate=plate, vehicle_type=vehicle_type,
        batch_start_date=start or TODAY - timedelta(days=30),
        batch_end_date=end or TODAY + timedelta(days=30),
        review_status=review_status, is_active=is_active,
    )


def csv_upload(body, name='students.csv'):
    return SimpleUploadedFile(name, (HEADER + body).encode(), content_type='text/csv')


def xlsx_upload(rows):
    from openpyxl import Workbook
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(['SN', 'Batch End Date', 'Class Days', 'From', 'To', 'Student Name', 'Contact', 'Vehicle Number'])
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return SimpleUploadedFile('students.xlsx', buffer.getvalue())


class StudentFileParsingTests(TestCase):
    def test_csv_with_header_aliases_and_loose_formats(self):
        bike = make_vehicle_type(name='Motorcycle')
        bike.category = 'BIKE'
        bike.save()
        source, raw = read_upload(csv_upload(
            '1,01/10/2026,31/12/2026,Sun-Fri,7:00 AM,9:30 AM,Ram Sharma,9800000000,ba 2 pa 1234,Bike,Active\n'
            ',,,,,,,,,,\n'
            '2,2026-10-01,2026-12-31,"Mon, Wed",14:00,16:00,Hari,,BA2PA99,,inactive\n'))
        rows, errors = normalize_rows(raw)
        self.assertEqual(source, 'CSV')
        self.assertEqual(errors, [])
        self.assertEqual(len(rows), 2)  # blank row skipped
        first = rows[0]
        self.assertEqual(first['license_plate'], 'BA2PA1234')
        self.assertEqual(first['batch_start_date'], date(2026, 10, 1))
        self.assertEqual(first['batch_end_date'], date(2026, 12, 31))
        self.assertEqual(first['class_days'], ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SUN'])
        self.assertEqual((first['class_time_from'], first['class_time_to']), (time(7), time(9, 30)))
        self.assertEqual(first['vehicle_type'].name, 'Motorcycle')  # matched by category "Bike"
        self.assertTrue(first['is_active'])
        self.assertFalse(rows[1]['is_active'])
        self.assertEqual(rows[1]['class_days'], ['MON', 'WED'])

    def test_xlsx_with_native_date_time_and_number_cells(self):
        source, raw = read_upload(xlsx_upload([
            [1, datetime(2026, 12, 31), 'Daily', time(6, 0), time(8, 0), 'Gita', 9811111111, 'BA 3 PA 5'],
        ]))
        rows, errors = normalize_rows(raw)
        self.assertEqual(source, 'EXCEL')
        self.assertEqual(errors, [])
        self.assertEqual(rows[0]['batch_end_date'], date(2026, 12, 31))
        self.assertEqual(rows[0]['contact_number'], '9811111111')
        self.assertEqual(rows[0]['sn'], '1')
        self.assertEqual(len(rows[0]['class_days']), 7)

    def test_row_errors_are_reported_per_row(self):
        _, raw = read_upload(csv_upload(
            '1,2026-12-01,2026-11-01,Funday,9:00,8:00,,98,BA1,,maybe\n'
            '2,,2026-12-31,,,,Ok,,BA1,,\n'))
        _, errors = normalize_rows(raw)
        fields = {(e['row'], e['field']) for e in errors}
        self.assertIn((1, 'name'), fields)
        self.assertIn((1, 'batch_end_date'), fields)  # before start
        self.assertIn((1, 'class_days'), fields)
        self.assertIn((1, 'class_time_to'), fields)
        self.assertIn((1, 'status'), fields)
        self.assertIn((2, 'license_plate'), fields)  # same plate as row 1

    def test_missing_required_column_rejects_the_file(self):
        from management.student_import import StudentFileError
        bad = SimpleUploadedFile('s.csv', b'Name,Phone\nRam,98\n')
        with self.assertRaisesMessage(StudentFileError, 'Vehicle Number'):
            read_upload(bad)

    def test_day_range_wraps_the_week(self):
        self.assertEqual(parse_days('Fri-Mon'), ['MON', 'FRI', 'SAT', 'SUN'])


class TenantPortalTests(TestCase):
    def setUp(self):
        self.vendor = make_vendor('Institute A')
        self.other_vendor = make_vendor('Institute B')
        self.tenant = make_user('t@a.com', TENANT, vendor=self.vendor)
        self.client = APIClient()
        self.client.force_authenticate(self.tenant)

    def test_submit_file_creates_pending_students(self):
        response = self.client.post('/api/v1/parking/tenant/student-requests', {
            'file': csv_upload('1,2026-10-01,2026-12-31,Sun-Fri,07:00,09:00,Ram,98,BA 1 PA 1,,Active\n'),
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['source'], 'CSV')
        self.assertEqual(response.data['status'], 'PENDING')
        student = Student.objects.get()
        self.assertEqual((student.vendor, student.review_status, student.license_plate),
                         (self.vendor, Student.PENDING, 'BA1PA1'))
        self.assertTrue(StudentRequest.objects.get().original_file.name.startswith('student_requests/'))

    def test_submit_json_rows(self):
        response = self.client.post('/api/v1/parking/tenant/student-requests', {'students': [
            {'sn': '1', 'name': 'Ram', 'license_plate': 'BA1', 'batch_end_date': '2026-12-31',
             'class_days': ['SUN', 'MON'], 'class_time_from': '07:00', 'class_time_to': '09:00',
             'status': 'Active'},
        ]}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Student.objects.get().class_days, ['MON', 'SUN'])

    def test_any_bad_row_saves_nothing(self):
        response = self.client.post('/api/v1/parking/tenant/student-requests', {
            'file': csv_upload('1,,2026-12-31,,,,Ram,,BA1,,\n2,,,,,,NoPlate,,,,\n'),
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual({e['row'] for e in response.data['errors']}, {2})
        self.assertFalse(StudentRequest.objects.exists())

    def test_preview_saves_nothing_and_warns_about_tenant_vehicles(self):
        make_staff(self.vendor, license_plate='BA9')
        response = self.client.post('/api/v1/parking/tenant/student-requests/preview', {
            'file': csv_upload('1,,2026-12-31,,,,Ram,,BA9,,\n'),
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['rows'][0]['batch_end_date'], '2026-12-31')
        self.assertEqual(len(response.data['warnings']), 1)
        self.assertFalse(StudentRequest.objects.exists())

    def test_tenant_only_sees_own_requests(self):
        make_student(self.other_vendor)
        mine = make_student(self.vendor, plate='BA2')
        response = self.client.get('/api/v1/parking/tenant/student-requests')
        self.assertEqual([r['id'] for r in response.data], [mine.request_id])
        response = self.client.get('/api/v1/parking/tenant/students')
        self.assertEqual([s['id'] for s in response.data], [mine.id])

    def test_tenant_cannot_change_students(self):
        student = make_student(self.vendor)
        for body in ({'batch_end_date': str(TODAY + timedelta(days=90))}, {'is_active': False}):
            response = self.client.patch(f'/api/v1/parking/tenant/students/{student.id}', body, format='json')
            self.assertIn(response.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED))
        student.refresh_from_db()
        self.assertEqual((student.review_status, student.is_active), (Student.APPROVED, True))

    def test_tenant_cannot_reach_admin_or_pos_endpoints(self):
        student = make_student(self.vendor)
        self.assertEqual(self.client.get('/api/v1/parking/student-requests').status_code, 403)
        self.assertEqual(self.client.post(f'/api/v1/parking/student-requests/{student.request_id}/review',
                                          {'approve': [student.id]}, format='json').status_code, 403)
        self.assertEqual(self.client.get('/api/v1/parking/sessions').status_code, 403)

    def test_staff_cannot_use_tenant_endpoints(self):
        self.client.force_authenticate(make_pos_user('pos@x.com'))
        self.assertEqual(self.client.get('/api/v1/parking/tenant/student-requests').status_code, 403)

    def test_login_returns_vendor(self):
        client = APIClient()
        response = client.post('/api/v1/public/user-app/users/login',
                               {'persona': 't@a.com', 'password': 'testpass123'}, format='json')
        self.assertEqual(response.data['vendor'], {'id': self.vendor.id, 'name': 'Institute A'})

    def login(self, email, portal):
        return APIClient().post('/api/v1/public/user-app/users/login',
                                {'persona': email, 'password': 'testpass123', 'portal': portal}, format='json')

    def test_each_login_page_only_accepts_its_own_accounts(self):
        make_user('desk@x.com', POS)
        self.assertEqual(self.login('t@a.com', 'tenant').status_code, 200)
        self.assertEqual(self.login('desk@x.com', 'staff').status_code, 200)

        response = self.login('desk@x.com', 'tenant')
        self.assertEqual(response.status_code, 400)
        self.assertNotIn('tokens', response.data)
        self.assertEqual(self.login('t@a.com', 'staff').status_code, 400)

    def test_tenant_login_without_a_tenant_link_is_refused(self):
        make_user('orphan@x.com', TENANT)
        self.assertEqual(self.login('orphan@x.com', 'tenant').status_code, 400)


class AdminReviewTests(TestCase):
    def setUp(self):
        self.vendor = make_vendor()
        self.admin = make_user('admin@x.com', ADMIN)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.a = make_student(self.vendor, plate='A1', review_status=Student.PENDING)
        self.request = self.a.request
        self.b = Student.objects.create(request=self.request, vendor=self.vendor, name='B', license_plate='B1',
                                        batch_end_date=TODAY + timedelta(days=5))

    def test_per_student_review(self):
        response = self.client.post(f'/api/v1/parking/student-requests/{self.request.id}/review', {
            'approve': [self.a.id], 'reject': [{'id': self.b.id, 'reason': 'Wrong plate'}],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['status'], 'REVIEWED')
        self.b.refresh_from_db()
        self.assertEqual((self.b.review_status, self.b.reject_reason, self.b.reviewed_by),
                         (Student.REJECTED, 'Wrong plate', self.admin))

    def test_partial_review_and_pending_filter(self):
        self.client.post(f'/api/v1/parking/student-requests/{self.request.id}/review',
                         {'approve': [self.a.id]}, format='json')
        detail = self.client.get(f'/api/v1/parking/student-requests/{self.request.id}').data
        self.assertEqual(detail['status'], 'PARTIAL')
        self.assertEqual(detail['counts'], {'total': 2, 'pending': 1, 'approved': 1, 'rejected': 0})
        self.assertEqual(len(self.client.get('/api/v1/parking/student-requests?status=pending').data), 1)

    def test_student_from_another_request_is_refused(self):
        other = make_student(self.vendor, plate='C1', review_status=Student.PENDING)
        response = self.client.post(f'/api/v1/parking/student-requests/{self.request.id}/review',
                                    {'approve': [other.id]}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        other.refresh_from_db()
        self.assertEqual(other.review_status, Student.PENDING)

    def test_admin_can_create_tenant_login(self):
        self.client.force_authenticate(User.objects.create_superuser(email='su@x.com', password='x' * 8))
        response = self.client.post('/api/v1/parking/operators', {
            'email': 'portal@a.com', 'password': 'longpassword', 'role': TENANT,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)  # vendor required
        response = self.client.post('/api/v1/parking/operators', {
            'email': 'portal@a.com', 'password': 'longpassword', 'role': TENANT, 'vendor': self.vendor.id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual((response.data['role'], response.data['vendor']), (TENANT, self.vendor.id))


class StudentBillingTests(TestCase):
    """Free from 15 min before class start to 15 min after class end (the
    default graces), on class days; everything else at visitor pricing
    (60/h, no minimum, round up to 5). Classes run 2h15m unless a test says
    otherwise, so the free time ends 2.5h after class start."""

    def setUp(self):
        self.vendor = make_vendor()
        self.vehicle_type = make_vehicle_type(free_duration_minutes=5)
        self.client = APIClient()
        self.client.force_authenticate(make_pos_user('pos@x.com'))

    def student(self, minutes_ago, days=None, length=135, **kwargs):
        """A student whose `length`-minute class started `minutes_ago` today."""
        student = make_student(self.vendor, **kwargs)
        class_start = timezone.localtime() - timedelta(minutes=minutes_ago)
        student.class_time_from = class_start.time()
        student.class_time_to = (class_start + timedelta(minutes=length)).time()
        student.class_days = Student.DAYS if days is None else days
        student.save()
        return student

    def exit_after(self, minutes, plate='BA2PA1111'):
        session = ParkingSession.objects.create(
            vehicle_type=self.vehicle_type, license_plate=plate,
            entry_time=timezone.now() - timedelta(minutes=minutes))
        response = self.client.post(f'/api/v1/parking/sessions/{session.ticket_number}/calculate-charge')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_student_parks_free_in_class_time(self):
        self.student(120)
        data = self.exit_after(120)
        self.assertEqual(Decimal(data['calculated_charge']), Decimal('0.00'))
        self.assertEqual(data['student']['name'], 'Sita')
        self.assertIn('Student (', data['notes'])

    def test_time_past_the_allowance_is_charged(self):
        self.student(180)
        data = self.exit_after(180)
        self.assertEqual(Decimal(data['calculated_charge']), Decimal('30.00'))
        self.assertTrue(data['student_billing']['applied'])
        self.assertIn('2h 30m free in student free time', data['student_billing']['message'])
        self.assertIn('charged for 30m after', data['student_billing']['message'])

    def test_billing_summary_says_fully_free(self):
        self.student(120)
        billing = self.exit_after(120)['student_billing']
        self.assertEqual((billing['applied'], billing['free_minutes']), (True, 120))
        self.assertIn('fully free', billing['message'])

    def test_billing_summary_explains_visitor_billing(self):
        self.student(-300)
        billing = self.exit_after(120)['student_billing']
        self.assertFalse(billing['applied'])
        self.assertIn('Outside student free time', billing['message'])
        self.assertIn('billed as visitor', billing['message'])

    def test_billing_summary_names_a_non_class_day(self):
        today = Student.DAYS[timezone.localtime().weekday()]
        self.student(120, days=[d for d in Student.DAYS if d != today])
        self.assertIn('is not a class day', self.exit_after(120)['student_billing']['message'])

    def test_billing_summary_without_class_time(self):
        make_student(self.vendor)
        self.assertIn('No class time', self.exit_after(120)['student_billing']['message'])

    def test_arriving_within_the_early_grace_is_free(self):
        self.student(150)  # arrived 10 min before class, left at class + 2.5h
        self.assertEqual(Decimal(self.exit_after(160)['calculated_charge']), Decimal('0.00'))

    def test_arriving_earlier_than_the_grace_is_charged(self):
        self.student(150)  # arrived 60 min before class: 45 min before the grace starts
        self.assertEqual(Decimal(self.exit_after(210)['calculated_charge']), Decimal('45.00'))

    def test_outside_class_time_pays_as_visitor(self):
        self.student(-300)  # class is 5 hours from now
        data = self.exit_after(120)
        self.assertIsNotNone(data['student'])
        self.assertEqual(Decimal(data['calculated_charge']), Decimal('115.00'))

    def test_non_class_day_pays_as_visitor(self):
        today = Student.DAYS[timezone.localtime().weekday()]
        self.student(120, days=[d for d in Student.DAYS if d != today])
        self.assertEqual(Decimal(self.exit_after(120)['calculated_charge']), Decimal('115.00'))

    def test_no_class_time_pays_as_visitor(self):
        make_student(self.vendor)
        self.assertEqual(Decimal(self.exit_after(120)['calculated_charge']), Decimal('115.00'))

    def test_plate_matches_regardless_of_spacing_and_case(self):
        self.student(60)
        data = self.exit_after(60, plate='ba 2 pa 1111')
        self.assertIsNotNone(data['student'])

    def test_no_class_end_time_pays_as_visitor(self):
        student = self.student(120)
        student.class_time_to = None
        student.save()
        data = self.exit_after(120)
        self.assertEqual(Decimal(data['calculated_charge']), Decimal('115.00'))
        self.assertIn('No class end time', data['student_billing']['message'])

    def test_late_grace_after_class_end(self):
        self.student(120, length=90)  # class ended 30 min ago; 15 min late grace
        self.assertEqual(Decimal(self.exit_after(120)['calculated_charge']), Decimal('15.00'))

    def test_global_late_grace_is_configurable(self):
        config = ParkingConfiguration.get_solo()
        config.student_late_grace_minutes = 30
        config.save()
        self.student(120, length=90)
        self.assertEqual(Decimal(self.exit_after(120)['calculated_charge']), Decimal('0.00'))

    def test_tenant_graces_override_global(self):
        config = ParkingConfiguration.get_solo()
        config.student_late_grace_minutes = 30
        config.save()
        self.vendor.student_early_grace_minutes = 60
        self.vendor.student_late_grace_minutes = 0
        self.vendor.save()
        # Arrived 60 min before class (inside the tenant's early grace),
        # left 30 min after class end (no late grace for this tenant).
        self.student(120, length=90)
        self.assertEqual(Decimal(self.exit_after(180)['calculated_charge']), Decimal('30.00'))

    def test_students_who_do_not_qualify_pay_as_visitors(self):
        cases = {
            'pending': dict(review_status=Student.PENDING),
            'rejected': dict(review_status=Student.REJECTED),
            'inactive': dict(is_active=False),
            'ended': dict(start=TODAY - timedelta(days=60), end=TODAY - timedelta(days=1)),
            'not started': dict(start=TODAY + timedelta(days=1)),
        }
        for index, (label, kwargs) in enumerate(cases.items()):
            with self.subTest(label):
                plate = f'P{index}'
                self.student(120, plate=plate, **kwargs)
                data = self.exit_after(120, plate=plate)
                self.assertIsNone(data['student'])
                self.assertEqual(Decimal(data['calculated_charge']), Decimal('115.00'))

    def test_student_approved_after_entry_still_gets_free_time(self):
        session = ParkingSession.objects.create(
            vehicle_type=self.vehicle_type, license_plate='BA2PA1111',
            entry_time=timezone.now() - timedelta(minutes=60))
        self.student(60)
        response = self.client.post(f'/api/v1/parking/sessions/{session.ticket_number}/calculate-charge')
        self.assertEqual(Decimal(response.data['calculated_charge']), Decimal('0.00'))

    def test_tenant_vehicle_wins_over_student(self):
        make_staff(self.vendor, vehicle_type=self.vehicle_type, license_plate='BA2PA1111')
        make_student(self.vendor)
        data = self.exit_after(60)
        self.assertIsNone(data['student'])


class StudentCardTests(TestCase):
    def setUp(self):
        self.vendor = make_vendor('Institute A')
        self.vehicle_type = make_vehicle_type(free_duration_minutes=0)
        self.student = make_student(self.vendor, vehicle_type=self.vehicle_type)
        self.client = APIClient()
        self.client.force_authenticate(make_pos_user('pos@x.com'))

    def scan(self, code=None):
        return self.client.post('/api/v1/parking/student-card/scan',
                                {'code': code or self.student.card_payload}, format='json')

    def test_entry_then_exit(self):
        entry = self.scan()
        self.assertEqual((entry.status_code, entry.data['action']), (201, 'ENTRY'))
        session = ParkingSession.objects.get()
        self.assertEqual(session.student, self.student)

        entry_time = timezone.now() - timedelta(minutes=170)
        ParkingSession.objects.filter(pk=session.pk).update(entry_time=entry_time)
        self.student.class_days = Student.DAYS
        self.student.class_time_from = timezone.localtime(entry_time).time()
        self.student.class_time_to = timezone.localtime(entry_time + timedelta(minutes=135)).time()
        self.student.save()
        exit_ = self.scan()
        self.assertEqual(exit_.data['action'], 'EXIT')
        self.assertEqual(Decimal(exit_.data['session']['calculated_charge']), Decimal('20.00'))
        self.assertEqual(exit_.data['student']['name'], 'Sita')

    def test_second_scan_within_cooldown_is_ignored(self):
        self.scan()
        self.assertEqual(self.scan().data['action'], 'DUPLICATE')
        self.assertEqual(ParkingSession.objects.filter(exit_time__isnull=True).count(), 1)

    def test_expired_student_cannot_enter_but_can_leave(self):
        self.student.batch_end_date = TODAY - timedelta(days=1)
        self.student.batch_start_date = TODAY - timedelta(days=60)
        self.student.save()
        response = self.scan()
        self.assertEqual(response.status_code, 400)
        self.assertIn('Batch ended', response.data['error'])

        ParkingSession.objects.create(vehicle_type=self.vehicle_type, license_plate=self.student.license_plate,
                                      entry_time=timezone.now() - timedelta(minutes=30))
        self.assertEqual(self.scan().data['action'], 'EXIT')

    def test_unknown_card(self):
        self.assertEqual(self.scan('ST-00000000-0000-0000-0000-000000000000').status_code, 404)
        self.assertEqual(self.scan('garbage').status_code, 404)


class VendorPortalLoginAdminTests(TestCase):
    """Admin sets each tenant's portal email/password on the Vendor page."""

    def setUp(self):
        from management.admin import VendorAdminForm
        self.Form = VendorAdminForm
        self.vendor = make_vendor('Institute A')

    def form(self, vendor=None, **portal):
        vendor = vendor or self.vendor
        data = {'name': vendor.name, 'stamp_free_minutes': vendor.stamp_free_minutes,
                'car_quota': 0, 'bike_quota': 0, 'gate_access_allowed': 'on', 'portal_active': 'on', **portal}
        if data.get('portal_active') is None:
            data.pop('portal_active')
        return self.Form(data=data, instance=vendor)

    def save(self, form):
        self.assertTrue(form.is_valid(), form.errors)
        vendor = form.save()
        form.save_portal_login(vendor)
        return User.objects.get(vendor=vendor)

    def portal_login(self, email, password):
        return APIClient().post('/api/v1/public/user-app/users/login',
                                {'persona': email, 'password': password, 'portal': 'tenant'}, format='json')

    def test_setting_email_and_password_creates_a_working_tenant_login(self):
        user = self.save(self.form(portal_email='Office@InstituteA.com', portal_password='Str0ng-pass-1'))
        self.assertEqual(user.email, 'office@institutea.com')
        self.assertEqual(list(user.groups.values_list('name', flat=True)), [TENANT])
        self.assertNotEqual(user.password, 'Str0ng-pass-1')  # hashed
        self.assertEqual(self.portal_login('office@institutea.com', 'Str0ng-pass-1').status_code, 200)

    def test_blank_password_keeps_it_and_a_new_one_resets_it(self):
        self.save(self.form(portal_email='o@a.com', portal_password='Str0ng-pass-1'))
        self.save(self.form(portal_email='o@a.com', portal_password=''))
        self.assertEqual(self.portal_login('o@a.com', 'Str0ng-pass-1').status_code, 200)

        self.save(self.form(portal_email='o@a.com', portal_password='N3w-pass-word'))
        self.assertEqual(self.portal_login('o@a.com', 'Str0ng-pass-1').status_code, 400)
        self.assertEqual(self.portal_login('o@a.com', 'N3w-pass-word').status_code, 200)

    def test_new_login_needs_a_password(self):
        form = self.form(portal_email='o@a.com')
        self.assertFalse(form.is_valid())
        self.assertIn('portal_password', form.errors)

    def test_weak_password_is_refused(self):
        form = self.form(portal_email='o@a.com', portal_password='123')
        self.assertFalse(form.is_valid())
        self.assertIn('portal_password', form.errors)

    def test_email_already_used_by_another_account_is_refused(self):
        make_user('desk@x.com', POS)
        form = self.form(portal_email='DESK@x.com', portal_password='Str0ng-pass-1')
        self.assertFalse(form.is_valid())
        self.assertIn('portal_email', form.errors)

    def test_unticking_active_blocks_sign_in(self):
        self.save(self.form(portal_email='o@a.com', portal_password='Str0ng-pass-1'))
        user = self.save(self.form(portal_email='o@a.com', portal_active=None))
        self.assertFalse(user.is_active)
        self.assertEqual(self.portal_login('o@a.com', 'Str0ng-pass-1').status_code, 400)

    def test_leaving_email_empty_changes_nothing(self):
        form = self.form()
        self.assertTrue(form.is_valid(), form.errors)
        form.save_portal_login(form.save())
        self.assertFalse(User.objects.filter(vendor=self.vendor).exists())

    def test_admin_page_saves_the_login(self):
        admin_user = User.objects.create_superuser(email='su@x.com', password='x' * 10)
        client = APIClient()
        client.force_login(admin_user)
        url = f'/admin/management/vendor/{self.vendor.pk}/change/'
        page = client.get(url)
        self.assertContains(page, 'Tenant portal login')
        self.assertNotContains(page, 'Str0ng-pass-1')

        response = client.post(url, {
            'name': 'Institute A', 'stamp_free_minutes': 60, 'car_quota': 0, 'bike_quota': 0,
            'gate_access_allowed': 'on', 'portal_email': 'o@a.com', 'portal_password': 'Str0ng-pass-1',
            'portal_active': 'on',
        })
        self.assertEqual(response.status_code, 302, getattr(response, 'context', None) and
                         response.context['adminform'].form.errors)
        self.assertEqual(self.portal_login('o@a.com', 'Str0ng-pass-1').status_code, 200)
        self.assertContains(client.get('/admin/management/vendor/'), 'o@a.com')
