// lib/public/roles.ts
// Mirrors backend/user_app/roles.py — role names are Django Group names,
// returned to the frontend as `roles: [{ name: 'admin' | 'pos' | 'superadmin', ... }]`.
import type { role } from '@/app/(public)/_login/_redux/types';

export const ROLE_POS = 'pos';
export const ROLE_ADMIN = 'admin';
export const ROLE_SUPERADMIN = 'superadmin';
// Tenant-portal login (not a staff tier): submits its own students only.
export const ROLE_TENANT = 'tenant';
export const TENANT_PORTAL = '/tenant-portal';
export const TENANT_LOGIN = '/tenant-portal/login';
export const TENANT_VEHICLES = '/tenant-portal/vehicles';

export interface RoleCheckable {
  isSuperuser?: boolean;
  roles?: role[] | [];
}

// isSuperuser is Django's own "bypasses every check" flag — treated as an
// automatic superadmin so nobody needs both the flag and the group.
export function hasRole(user: RoleCheckable | null | undefined, ...allowed: string[]): boolean {
  if (!user) return false;
  if (user.isSuperuser) return true;
  const roleNames = (user.roles ?? []).map((r) => r.name);
  return allowed.some((r) => roleNames.includes(r));
}

export const isSuperAdmin = (user: RoleCheckable | null | undefined) => hasRole(user, ROLE_SUPERADMIN);
export const isAdminOrAbove = (user: RoleCheckable | null | undefined) =>
  hasRole(user, ROLE_ADMIN, ROLE_SUPERADMIN);
export const isPosOrAbove = (user: RoleCheckable | null | undefined) =>
  hasRole(user, ROLE_POS, ROLE_ADMIN, ROLE_SUPERADMIN);
// Not via hasRole: a superuser passes every hasRole check, but isn't a tenant.
export const isTenantUser = (user: RoleCheckable | null | undefined) =>
  !!user && !isPosOrAbove(user) && (user.roles ?? []).some((r) => r.name === ROLE_TENANT);

// Where to send a signed-in user who can't access the page they landed on.
export function defaultRouteForUser(user: RoleCheckable | null | undefined): string {
  if (isAdminOrAbove(user)) return '/dashboard';
  if (hasRole(user, ROLE_POS)) return '/sessions';
  if (isTenantUser(user)) return TENANT_PORTAL;
  return '/profile';
}

// Where to land right after login: admins/superadmins go to the dashboard,
// tenants to their portal, POS (and anyone else) to the root page.
export function postLoginRouteForUser(user: RoleCheckable | null | undefined): string {
  if (isAdminOrAbove(user)) return '/dashboard';
  return isTenantUser(user) ? TENANT_PORTAL : '/';
}
