"""
Tenant portal: the tenant's own registered vehicles (Staff rows whose company
is the login's vendor). View only — adding or changing a vehicle stays with
the parking office.

    GET  tenant/vehicles    (IsTenant, always scoped to request.user.vendor)
"""
from rest_framework import mixins, viewsets

from .models import Staff
from .permissions import IsTenant
from .serializers import TenantVehicleSerializer


class TenantVehicleViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsTenant]
    serializer_class = TenantVehicleSerializer

    def get_queryset(self):
        return (Staff.objects.filter(company_id=self.request.user.vendor_id)
                .select_related('vehicle_type').order_by('name', 'license_plate'))
