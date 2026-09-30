# management/permissions.py
"""Role-based access for the parking-management API.

pos: front-desk checkout only (parking sessions + the tenant-card gate flow),
plus read-only access to the reference data (vehicle types, vendors) needed
to populate that screen.
admin: full back-office access — pricing, vehicle types, vendors, staff,
coupons, passes, sessions — but not system-wide configuration.
superadmin: everything, including system-wide configuration.
tenant: the tenant portal only — its own student requests (User.vendor).
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from user_app.roles import ADMIN, POS, SUPERADMIN, is_tenant_account, user_has_role


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return user_has_role(request.user, SUPERADMIN)


class IsAdminOrAbove(BasePermission):
    def has_permission(self, request, view):
        return user_has_role(request.user, ADMIN, SUPERADMIN)


class IsPOSOrAbove(BasePermission):
    def has_permission(self, request, view):
        return user_has_role(request.user, POS, ADMIN, SUPERADMIN)


class IsPOSReadOnlyOrAdminAbove(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return user_has_role(request.user, POS, ADMIN, SUPERADMIN)
        return user_has_role(request.user, ADMIN, SUPERADMIN)


class IsTenant(BasePermission):
    """A tenant-portal login (see user_app.roles.is_tenant_account). Every
    tenant endpoint is scoped to request.user.vendor."""
    def has_permission(self, request, view):
        return is_tenant_account(request.user)
