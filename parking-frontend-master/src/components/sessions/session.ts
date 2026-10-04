// Shared by the sessions list and the single-session page so a plate, a
// status or a duration reads the same wherever it appears.

export type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'PAID' | 'WAIVED' | 'COVERED_BY_PASS';
export type PaymentMethod = 'CASH' | 'ONLINE_PAYMENT';

export interface ParkingSession {
  id: string;
  ticket_number: string;
  vehicle_type: string;
  license_plate: string | null;
  registered_staff_member: string | null;
  entry_time: string;
  exit_time: string | null;
  duration_minutes: number | null;
  applied_coupon: string | null;
  applied_pass: string | null;
  calculated_charge: string | null;
  payment_method: PaymentMethod | null;
  status: SessionStatus;
  notes: string;
  auto_closed?: boolean;
}

// What the single-ticket endpoint adds on top of the list row.
export interface ParkingSessionDetail extends ParkingSession {
  undiscounted_charge?: string | null;
  discount_value?: string | null;
  charge_after_discount?: string | null;
  stamps?: Array<{ id: string | number; vendor: string; free_minutes_granted: number; stamped_at: string }>;
  total_stamp_minutes?: number | null;
  tenant_bill?: { id: string | number; vendor: string; overage_minutes: number; amount: string; created_at: string } | null;
  student?: { id: string | number; name: string; vendor: string; contact_number?: string | null } | null;
  student_billing?: { message?: string } | null;
  lost_ticket?: boolean;
}

// A session still parked after this long is almost always a missed exit scan.
export const OVERSTAY_MINUTES = 12 * 60;

export const formatAmount = (value: string | number | null) => {
  const n = Number(value ?? 0);
  return `NRs ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

export const formatDuration = (totalMinutes: number) => {
  const mins = Math.max(0, Math.round(totalMinutes));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

export const paymentLabel = (s: ParkingSession) => {
  if (s.status === 'PAID') return s.payment_method === 'CASH' ? 'Cash' : 'Online';
  if (s.status === 'COVERED_BY_PASS') return 'Monthly pass';
  if (s.status === 'WAIVED') return s.applied_coupon ? `Coupon · ${s.applied_coupon}` : 'Waived';
  if (s.status === 'COMPLETED') return Number(s.calculated_charge || 0) > 0 ? 'Unpaid' : '—';
  return '—';
};

// A quiet dot and a word. The label carries the meaning; colour only helps the
// eye group rows. No pulsing — a page of active sessions would be a light show.
export const STATUS: Record<SessionStatus, { label: string; dot: string }> = {
  ACTIVE: { label: 'Active', dot: 'bg-blue-500' },
  COMPLETED: { label: 'Completed', dot: 'bg-zinc-400 dark:bg-zinc-500' },
  PAID: { label: 'Paid', dot: 'bg-emerald-500' },
  WAIVED: { label: 'Waived', dot: 'bg-amber-500' },
  COVERED_BY_PASS: { label: 'Covered by pass', dot: 'bg-violet-500' },
};
