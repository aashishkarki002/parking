# user_app/roles.py
"""Role names used as Django Group labels for operator accounts.

Roles are plain Django Groups (see user_app/migrations/0002_seed_roles.py),
not a separate model — this keeps them compatible with the admin site's
existing groups UI and the frontend's GroupSerializer-shaped `roles` field.
"""

POS = 'pos'
ADMIN = 'admin'
SUPERADMIN = 'superadmin'

ALL_ROLES = (POS, ADMIN, SUPERADMIN)

# Tenant portal login (User.vendor says which tenant). Kept out of ALL_ROLES:
# it isn't a staff tier, so no staff permission ever grants it anything.
TENANT = 'tenant'


def user_has_role(user, *roles):
    """True if `user` is a Django superuser or belongs to any of `roles`.

    is_superuser is treated as an automatic superadmin: it's Django's own
    "bypasses every permission check" flag, so anyone who has it shouldn't
    also need to be manually added to the superadmin group.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.groups.filter(name__in=roles).exists()


def is_tenant_account(user):
    """A tenant-portal login: in the tenant group, linked to a tenant, and not
    also a staff account (staff access wins, so a superuser is never one)."""
    if not user or not user.is_authenticated or not user.vendor_id:
        return False
    if user_has_role(user, *ALL_ROLES):
        return False
    return user.groups.filter(name=TENANT).exists()
