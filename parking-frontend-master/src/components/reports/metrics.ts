// Report aggregations over /parking/sessions.
//
// There is no reporting endpoint — the router exposes plain list views — so
// every figure here is derived client-side from the session list. Two things
// this module exists to get right:
//
//  1. Honest revenue accounting. `discount_value` on a session only covers
//     *free minutes* (vehicle-type grace + coupon minutes + tenant stamps).
//     A waived or pass-covered session zeroes the visitor's charge without
//     touching it. So revenue foregone is measured as
//     `undiscounted_charge - calculated_charge`, which captures every cause,
//     and `discount_value` is reported separately as the free-minutes share.
//
//  2. Not double-counting the tenant. A stamped visitor who overstays is never
//     charged at the gate; the excess is billed to the tenant instead
//     (TenantBill). That amount is revenue *recovered*, so it offsets the
//     foregone total rather than adding to it.
//
//  3. Not calling a subscription a loss. A monthly pass holder pays a fixed fee
//     up front and then parks without paying at the gate, so their sessions look
//     identical to a give-away in the session data — `undiscounted_charge` minus
//     nothing collected. That money was collected, only on a different invoice,
//     so pass-covered value is held in `passValue` and kept out of `leakage` and
//     `netLost`. What it *is* good for is pricing: compare it against the fees
//     actually earned for the window (see passes.ts) to see whether the pass is
//     worth what a gate ticket would have been.

export type SessionStatus =
  | 'ACTIVE'
  | 'COMPLETED'
  | 'PAID'
  | 'WAIVED'
  | 'STAMPED'
  | 'COVERED_BY_PASS';

export interface SessionStamp {
  id: number;
  vendor: string;
  free_minutes_granted: number;
  stamped_at: string;
}

export interface SessionTenantBill {
  id: number;
  vendor: string;
  overage_minutes: number;
  amount: string;
  created_at: string;
}

export interface ReportSession {
  id: string;
  ticket_number: string;
  vehicle_type: string | null;
  license_plate: string;
  registered_staff_member: string | null;
  entry_time: string;
  exit_time: string | null;
  duration_minutes: number | null;
  applied_coupon: string | null;
  applied_pass: string | null;
  calculated_charge: string | null;
  payment_method: string | null;
  status: SessionStatus;
  undiscounted_charge: string | null;
  discount_value: string | null;
  charge_after_discount: string | null;
  stamps: SessionStamp[];
  total_stamp_minutes: number;
  tenant_bill: SessionTenantBill | null;
  auto_closed?: boolean;
}

const num = (value: string | number | null | undefined) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// A session still parked has no exit and no final charge, so it carries no
// revenue yet — it is counted as traffic but excluded from every money figure.
export const hasExited = (s: ReportSession) => Boolean(s.exit_time);

// Plates are typed by operators at the gate; normalising here stops "ba 1 pa
// 1234" and "BA 1 PA 1234" from counting as two different vehicles.
export const plateKey = (plate: string) => plate.trim().toUpperCase().replace(/\s+/g, ' ');

export const isRegistered = (s: ReportSession) => s.registered_staff_member !== null;

// ---------------------------------------------------------------------------
// Revenue lost, by cause
// ---------------------------------------------------------------------------

export type LossCause = 'VALIDATION' | 'PASS' | 'COUPON' | 'WAIVED' | 'GRACE';

export const LOSS_CAUSE_LABELS: Record<LossCause, string> = {
  VALIDATION: 'Tenant validation',
  PASS: 'Monthly pass',
  COUPON: 'Coupon',
  WAIVED: 'Waived at gate',
  GRACE: 'Free grace period',
};

/** True when a monthly pass, not a give-away, is why nothing was charged. */
export const isPassCovered = (s: ReportSession) =>
  s.status === 'COVERED_BY_PASS' || Boolean(s.applied_pass);

// The free-minute sources interact non-linearly (tiered brackets, minimum
// charges), so a session's foregone amount cannot be split linearly between
// them. Each session is attributed whole to its *primary* cause instead, in
// this precedence — anything the UI shows must be labelled as such.
export function primaryCause(s: ReportSession): LossCause {
  if (isPassCovered(s)) return 'PASS';
  if (s.status === 'WAIVED') return 'WAIVED';
  if (s.stamps.length > 0) return 'VALIDATION';
  if (s.applied_coupon) return 'COUPON';
  return 'GRACE';
}

export interface CauseBreakdown {
  cause: LossCause;
  label: string;
  sessions: number;
  foregone: number;
  /** Recovered from tenants — only ever non-zero for VALIDATION. */
  recovered: number;
  /** Share of the total this breakdown covers, 0–100. */
  pct: number;
}

export interface TenantValidation {
  vendor: string;
  stamps: number;
  sessionsValidated: number;
  freeMinutesGranted: number;
  overageSessions: number;
  overageMinutes: number;
  amountBilled: number;
}

export interface ReportMetrics {
  // Traffic
  sessions: number;
  exited: number;
  stillParked: number;
  uniqueVehicles: number;
  repeatVisits: number;
  registeredSessions: number;
  registeredVehicles: number;
  visitorSessions: number;
  visitorVehicles: number;
  avgDurationMinutes: number;

  // Money (exited sessions only)
  grossValue: number;
  collected: number;
  /** Full-rate value never charged at the gate, whatever the reason. */
  foregone: number;
  recoveredFromTenants: number;
  /**
   * Full-rate value consumed by monthly-pass holders. Paid for by the pass fee,
   * not lost — held apart so it never lands in `leakage` or `netLost`.
   */
  passValue: number;
  passSessions: number;
  passVehicles: number;
  /** Foregone value that a subscription does *not* account for. */
  leakage: number;
  netLost: number;
  /**
   * Charged *above* the raw plan value because a plan minimum kicked in on a
   * short stay. Held separately so it never nets against the loss, which keeps
   * the reconciliation exact:
   *   grossValue - collected === foregone - minimumSurcharge
   */
  minimumSurcharge: number;
  /** The free-minutes share of the loss, per the API's own discount_value. */
  freeMinutesValue: number;
  /** Share of gross value actually collected, 0–100. */
  captureRate: number;
  /**
   * Full-rate value that was chargeable at the gate at all — gross less the
   * part a pass already covers. Uses `collected + leakage` so the
   * minimum-charge uplift cannot push the rate below it past 100%.
   */
  chargeableValue: number;
  /** Share of chargeable value actually collected, 0–100. */
  chargeableCaptureRate: number;
  cashCollected: number;
  digitalCollected: number;
  unpaidValue: number;

  // Validation & overage
  stampsIssued: number;
  sessionsValidated: number;
  freeMinutesGranted: number;
  overageSessions: number;
  overageMinutes: number;
  overageBilled: number;

  /**
   * Ranked causes of `leakage` — pass-covered sessions are deliberately absent,
   * and the shares are of leakage rather than of total foregone.
   */
  leakCauses: CauseBreakdown[];
  tenants: TenantValidation[];
}

const EMPTY_METRICS: ReportMetrics = {
  sessions: 0,
  exited: 0,
  stillParked: 0,
  uniqueVehicles: 0,
  repeatVisits: 0,
  registeredSessions: 0,
  registeredVehicles: 0,
  visitorSessions: 0,
  visitorVehicles: 0,
  avgDurationMinutes: 0,
  grossValue: 0,
  collected: 0,
  foregone: 0,
  recoveredFromTenants: 0,
  passValue: 0,
  passSessions: 0,
  passVehicles: 0,
  leakage: 0,
  netLost: 0,
  minimumSurcharge: 0,
  freeMinutesValue: 0,
  captureRate: 0,
  chargeableValue: 0,
  chargeableCaptureRate: 0,
  cashCollected: 0,
  digitalCollected: 0,
  unpaidValue: 0,
  stampsIssued: 0,
  sessionsValidated: 0,
  freeMinutesGranted: 0,
  overageSessions: 0,
  overageMinutes: 0,
  overageBilled: 0,
  leakCauses: [],
  tenants: [],
};

// Anything other than cash counts as digital; an empty method means the money
// was never taken (waived, pass-covered, or still open).
const isDigital = (method: string | null) => {
  const m = (method || '').toLowerCase();
  return m !== '' && m !== 'cash';
};

export function computeMetrics(sessions: ReportSession[]): ReportMetrics {
  if (sessions.length === 0) return EMPTY_METRICS;

  const m: ReportMetrics = { ...EMPTY_METRICS, leakCauses: [], tenants: [] };

  const allPlates = new Set<string>();
  const registeredPlates = new Set<string>();
  const visitorPlates = new Set<string>();
  // Counted over every session, exited or not — "how many vehicles are using a
  // pass" is a traffic question, so it does not wait for an exit.
  const passPlates = new Set<string>();
  const validatedSessionIds = new Set<string>();

  const byCause = new Map<LossCause, { sessions: number; foregone: number; recovered: number }>();
  const byTenant = new Map<string, TenantValidation>();

  let durationTotal = 0;
  let durationCount = 0;

  for (const s of sessions) {
    m.sessions += 1;

    const plate = plateKey(s.license_plate || '');
    if (plate) {
      allPlates.add(plate);
      (isRegistered(s) ? registeredPlates : visitorPlates).add(plate);
      if (isPassCovered(s)) passPlates.add(plate);
    }

    if (isRegistered(s)) m.registeredSessions += 1;
    else m.visitorSessions += 1;

    // Stamps and tenant bills are recorded against the session regardless of
    // whether it has exited, so validation stats cover every session.
    if (s.stamps.length > 0) {
      m.stampsIssued += s.stamps.length;
      m.sessionsValidated += 1;
      validatedSessionIds.add(s.id);
    }

    for (const stamp of s.stamps) {
      m.freeMinutesGranted += stamp.free_minutes_granted;
      const tenant = byTenant.get(stamp.vendor) ?? {
        vendor: stamp.vendor,
        stamps: 0,
        sessionsValidated: 0,
        freeMinutesGranted: 0,
        overageSessions: 0,
        overageMinutes: 0,
        amountBilled: 0,
      };
      tenant.stamps += 1;
      tenant.freeMinutesGranted += stamp.free_minutes_granted;
      byTenant.set(stamp.vendor, tenant);
    }

    // One session can carry several stamps from the same tenant; count the
    // session once per tenant that stamped it.
    for (const vendor of new Set(s.stamps.map((stamp) => stamp.vendor))) {
      const tenant = byTenant.get(vendor);
      if (tenant) tenant.sessionsValidated += 1;
    }

    if (s.tenant_bill) {
      m.overageSessions += 1;
      m.overageMinutes += s.tenant_bill.overage_minutes;
      m.overageBilled += num(s.tenant_bill.amount);

      const vendor = s.tenant_bill.vendor;
      const tenant = byTenant.get(vendor) ?? {
        vendor,
        stamps: 0,
        sessionsValidated: 0,
        freeMinutesGranted: 0,
        overageSessions: 0,
        overageMinutes: 0,
        amountBilled: 0,
      };
      tenant.overageSessions += 1;
      tenant.overageMinutes += s.tenant_bill.overage_minutes;
      tenant.amountBilled += num(s.tenant_bill.amount);
      byTenant.set(vendor, tenant);
    }

    if (typeof s.duration_minutes === 'number') {
      durationTotal += s.duration_minutes;
      durationCount += 1;
    }

    if (!hasExited(s)) {
      m.stillParked += 1;
      continue;
    }

    m.exited += 1;

    const gross = num(s.undiscounted_charge);
    const collected = num(s.calculated_charge);
    const recovered = num(s.tenant_bill?.amount);
    // A plan minimum can push the final charge above the raw plan value on a
    // short stay. That is not negative loss, so the two directions are tracked
    // apart rather than netted into one signed number.
    const foregone = Math.max(0, gross - collected);

    m.grossValue += gross;
    m.collected += collected;
    m.foregone += foregone;
    m.minimumSurcharge += Math.max(0, collected - gross);
    m.recoveredFromTenants += recovered;
    m.freeMinutesValue += num(s.discount_value);

    if (collected > 0) {
      if (isDigital(s.payment_method)) m.digitalCollected += collected;
      else m.cashCollected += collected;
    }
    // Exited, still owed money, and no payment recorded against it.
    if (collected > 0 && s.status !== 'PAID') m.unpaidValue += collected;

    const cause = primaryCause(s);
    const bucket = byCause.get(cause) ?? { sessions: 0, foregone: 0, recovered: 0 };
    bucket.sessions += 1;
    bucket.foregone += foregone;
    bucket.recovered += recovered;
    byCause.set(cause, bucket);
  }

  m.uniqueVehicles = allPlates.size;
  m.repeatVisits = Math.max(0, m.sessions - m.uniqueVehicles);
  m.registeredVehicles = registeredPlates.size;
  m.visitorVehicles = visitorPlates.size;
  m.avgDurationMinutes = durationCount > 0 ? Math.round(durationTotal / durationCount) : 0;

  m.passVehicles = passPlates.size;
  const pass = byCause.get('PASS');
  m.passValue = pass?.foregone ?? 0;
  m.passSessions = pass?.sessions ?? 0;

  // Subscriptions first, then tenant billing: both are money that arrived on a
  // different invoice, so neither belongs in the figure called "lost".
  m.leakage = Math.max(0, m.foregone - m.passValue);
  m.netLost = Math.max(0, m.leakage - m.recoveredFromTenants);

  m.captureRate = m.grossValue > 0 ? (m.collected / m.grossValue) * 100 : 0;
  m.chargeableValue = m.collected + m.leakage;
  m.chargeableCaptureRate =
    m.chargeableValue > 0 ? (m.collected / m.chargeableValue) * 100 : 0;

  m.leakCauses = Array.from(byCause.entries())
    // A cause with nothing foregone behind it (every grace-period session
    // stayed inside its free minutes, say) is not a row in a loss ranking.
    .filter(([cause, v]) => cause !== 'PASS' && v.foregone > 0)
    .map(([cause, v]) => ({
      cause,
      label: LOSS_CAUSE_LABELS[cause],
      sessions: v.sessions,
      foregone: v.foregone,
      recovered: v.recovered,
      pct: m.leakage > 0 ? (v.foregone / m.leakage) * 100 : 0,
    }))
    .sort((a, b) => b.foregone - a.foregone);

  m.tenants = Array.from(byTenant.values()).sort(
    (a, b) => b.amountBilled - a.amountBilled || b.stamps - a.stamps
  );

  return m;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const formatMoney = (amount: number, currency: string) =>
  `${currency} ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(amount))}`;

export const formatMinutes = (minutes: number) => {
  if (minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

export const formatPct = (value: number) => `${value.toFixed(value >= 10 ? 0 : 1)}%`;
