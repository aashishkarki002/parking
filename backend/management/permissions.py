# management/permissions.py
"""Role-based access for the parking-management API.

pos: front-desk checkout only (parking sessions + the tenant-card gate flow),
plus read-only access to the reference data (vehicle types, vendors) needed
to populate that screen.
admin: full back-office access — pricing, vehicle types, vendors, staff,
coupons, passes, sessions — but not system-wide configuration.
superadmin: everything, including system-wide configuration.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from user_app.roles import ADMIN, POS, SUPERADMIN, user_has_role


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
