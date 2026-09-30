from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from user_app.roles import POS, TENANT
from management.test_students import make_user
from management.tests import make_staff, make_vehicle_type, make_vendor

URL = '/api/v1/parking/tenant/vehicles'


class TenantVehicleTests(TestCase):
    def setUp(self):
        self.vendor = make_vendor()
        self.other = make_vendor(name='Other Tenant')
        car = make_vehicle_type()
        make_staff(self.vendor, vehicle_type=car, license_plate='BA1PA1', name='Ram')
        make_staff(self.other, vehicle_type=car, license_plate='BA1PA2', name='Hari')
        make_staff(None, vehicle_type=car, license_plate='BA1PA3', name='No company')
        self.client = APIClient()

    def test_tenant_sees_only_its_own_vehicles_without_card_codes(self):
        self.client.force_authenticate(make_user('t@a.com', TENANT, vendor=self.vendor))
        response = self.client.get(URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([v['license_plate'] for v in response.data], ['BA1PA1'])
        vehicle = response.data[0]
        self.assertEqual((vehicle['vehicle_type'], vehicle['vehicle_category']), ('Test Car', 'CAR'))
        self.assertNotIn('card_code', vehicle)

    def test_staff_accounts_are_refused(self):
        self.client.force_authenticate(make_user('desk@x.com', POS))
        self.assertEqual(self.client.get(URL).status_code, status.HTTP_403_FORBIDDEN)
