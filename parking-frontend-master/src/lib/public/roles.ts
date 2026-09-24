// lib/public/roles.ts
// Mirrors backend/user_app/roles.py — role names are Django Group names,
// returned to the frontend as `roles: [{ name: 'admin' | 'pos' | 'superadmin', ... }]`.
import type { role } from '@/app/(public)/_login/_redux/types';

export const ROLE_POS = 'pos';
export const ROLE_ADMIN = 'admin';
export const ROLE_SUPERADMIN = 'superadmin';

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

// Where to send a signed-in user who can't access the page they landed on.
export function defaultRouteForUser(user: RoleCheckable | null | undefined): string {
  if (isAdminOrAbove(user)) return '/dashboard';
  if (hasRole(user, ROLE_POS)) return '/sessions';
  return '/profile';
}
