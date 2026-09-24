import dayjs, { type Dayjs } from 'dayjs';
import {
  monthKey,
  tenantKeyFor,
  type LiveTotals,
  type Period,
  type SessionRow,
  type TenantStatementRow,
  type VendorRow,
  type VisitRow,
} from './types';

// A session counts as a guest visit when a tenant stamped it. A tenant's own
// registered vehicle is excluded even if it carries a stamp: the backend
// refuses to bill a tenant for its own staff (refresh_stamp_coverage bails on
// is_registered_tenant_vehicle and deletes any bill), so counting those as
// guests would inflate footfall with people who work there.
export const isGuestVisit = (s: SessionRow) =>
  (s.stamps?.length ?? 0) > 0 && s.registered_staff_member === null;

// Visits are placed in a period by entry_time — when the guest actually turned
// up. TenantBill.created_at would drift a late-night arrival into the next
// day, and it does not exist at all for a visit that stayed inside the free
// window, which still needs to be counted.
const inPeriod = (s: SessionRow, period: Period) => {
  if (!period.start || !period.end) return true;
  const t = dayjs(s.entry_time);
  return !t.isBefore(period.start) && !t.isAfter(period.end);
};

const distinctStampers = (s: SessionRow) => {
  const seen: string[] = [];
  (s.stamps ?? []).forEach((stamp) => {
    if (stamp.vendor && !seen.includes(stamp.vendor)) seen.push(stamp.vendor);
  });
  return seen;
};

export interface StatementData {
  rows: TenantStatementRow[];
  // Distinct tickets, not the sum of the per-tenant guest counts — a ticket
  // stamped by two tenants shows under both but is still one guest.
  totalGuests: number;
  totalOverstays: number;
  totalOverageMinutes: number;
  totalAmount: number;
  sharedVisits: number;
  live: LiveTotals;
}

export const buildStatement = (
  sessions: SessionRow[],
  vendors: VendorRow[],
  period: Period,
  now: Dayjs = dayjs()
): StatementData => {
  const vendorByName = new Map(vendors.map((v) => [v.name, v]));
  const acc = new Map<string, TenantStatementRow>();

  const guestVisits = sessions.filter((s) => isGuestVisit(s) && inPeriod(s, period));

  // Only completed exits reach the statement. A guest still parked has an
  // overage that keeps growing, and the bill on their session is whatever the
  // last gate scan happened to leave there — see the live totals below.
  const completed = guestVisits.filter((s) => s.exit_time !== null);

  let totalOverstays = 0;
  let totalOverageMinutes = 0;
  let totalAmount = 0;
  let sharedVisits = 0;

  completed.forEach((s) => {
    const stampers = distinctStampers(s);
    if (stampers.length === 0) return;
    if (stampers.length > 1) sharedVisits += 1;

    const bill = s.tenant_bill;
    const stayed = s.duration_minutes ?? dayjs(s.exit_time!).diff(dayjs(s.entry_time), 'minute');

    if (bill) {
      totalOverstays += 1;
      totalOverageMinutes += bill.overage_minutes;
      totalAmount += Number(bill.amount || 0);
    }

    stampers.forEach((name) => {
      const vendor = vendorByName.get(name);
      const key = tenantKeyFor(name, vendor);
      let row = acc.get(key);
      if (!row) {
        row = {
          key,
          name,
          vendor: vendor ?? null,
          visits: [],
          guests: 0,
          overstays: 0,
          overageMinutes: 0,
          amount: 0,
        };
        acc.set(key, row);
      }

      // Only the tenant the backend charged carries the money. Everyone else
      // who stamped this ticket hosted the guest for free.
      const billed = bill !== null && bill.vendor === name;
      const overage = billed ? bill!.overage_minutes : 0;
      const amount = billed ? Number(bill!.amount || 0) : 0;
      const ownStamp = (s.stamps ?? [])
        .filter((st) => st.vendor === name)
        .sort((a, b) => dayjs(a.stamped_at).diff(dayjs(b.stamped_at)))[0];

      const visit: VisitRow = {
        sessionId: s.id,
        ticket: s.ticket_number,
        plate: s.license_plate,
        vehicleType: s.vehicle_type,
        entry: s.entry_time,
        exit: s.exit_time,
        stayedMinutes: stayed,
        freeMinutes: s.total_stamp_minutes ?? 0,
        stampedAt: ownStamp?.stamped_at ?? s.entry_time,
        overageMinutes: overage,
        amount,
        billed,
        stamperNames: stampers,
      };

      row.visits.push(visit);
      row.guests += 1;
      if (billed) {
        row.overstays += 1;
        row.overageMinutes += overage;
        row.amount += amount;
      }
    });
  });

  const rows = Array.from(acc.values())
    .map((r) => ({
      ...r,
      visits: r.visits.sort((a, b) => dayjs(b.entry).diff(dayjs(a.entry))),
    }))
    // Biggest debtor first, then busiest — a tenant who owes nothing is still
    // listed, because "you hosted 40 guests and owe nothing" is the answer to
    // a real question a tenant will ask.
    .sort((a, b) => b.amount - a.amount || b.guests - a.guests || a.name.localeCompare(b.name));

  // Still-parked stamped guests. Their session's tenant_bill is only refreshed
  // when the ticket is scanned, so the amount is labelled as "at last scan"
  // wherever it surfaces — the minute count below is computed live instead.
  const open = guestVisits.filter((s) => s.exit_time === null);
  const live: LiveTotals = {
    stillParked: open.length,
    alreadyOver: open.filter(
      (s) => now.diff(dayjs(s.entry_time), 'minute') > (s.total_stamp_minutes ?? 0)
    ).length,
    accrued: open.reduce((sum, s) => sum + Number(s.tenant_bill?.amount || 0), 0),
  };

  return {
    rows,
    totalGuests: completed.length,
    totalOverstays,
    totalOverageMinutes,
    totalAmount,
    sharedVisits,
    live,
  };
};

// Months that actually have stamped guest traffic, newest first, so the period
// picker never offers an empty month.
export const monthsWithVisits = (sessions: SessionRow[]): Array<{ key: string; label: string }> => {
  const seen = new Set<string>();
  const out: Array<{ key: string; label: string; sort: number }> = [];
  sessions.filter(isGuestVisit).forEach((s) => {
    const d = dayjs(s.entry_time).startOf('month');
    const key = monthKey(d);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, label: d.format('MMMM YYYY'), sort: d.valueOf() });
  });
  return out.sort((a, b) => b.sort - a.sort).map(({ key, label }) => ({ key, label }));
};
