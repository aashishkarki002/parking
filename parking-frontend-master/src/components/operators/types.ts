// Shape returned by /parking/operators. Mirrors backend OperatorSerializer —
// `role` is the single highest tier the account's groups resolve to
// (superadmin > admin > pos), not a list: see management/serializers.py.
import { ROLE_ADMIN, ROLE_POS, ROLE_SUPERADMIN, ROLE_TENANT } from '@/lib/public/roles';

export type OperatorRole = typeof ROLE_POS | typeof ROLE_ADMIN | typeof ROLE_SUPERADMIN | typeof ROLE_TENANT;

export interface Operator {
  id: number;
  email: string;
  phone_no: string | null;
  is_active: boolean;
  role: OperatorRole | null;
  date_joined: string;
  // Tenant-portal logins only.
  vendor: number | null;
  vendor_name: string | null;
}

export const OPERATOR_ROLES: { value: OperatorRole; label: string; hint: string }[] = [
  { value: ROLE_POS, label: 'POS', hint: 'Front-desk checkout only.' },
  { value: ROLE_ADMIN, label: 'Admin', hint: 'Full back-office access — pricing, vehicles, tenants, passes.' },
  { value: ROLE_SUPERADMIN, label: 'Super admin', hint: 'Everything, including system configuration and operators.' },
  { value: ROLE_TENANT, label: 'Tenant portal', hint: 'A tenant’s own login: sends student lists for approval. No desk access.' },
];

export const roleLabel = (role: OperatorRole | null | undefined): string =>
  OPERATOR_ROLES.find((r) => r.value === role)?.label ?? 'No role';
