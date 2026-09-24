// Statements answer one question: how many guests did each tenant validate
// with a stamp, and how much do they owe us for the ones who overstayed what
// that stamp covered?
//
// The backend flow this mirrors (ParkingSession.refresh_stamp_coverage): a
// guest parks, a tenant stamps their chit, and the stamp grants that tenant's
// stamp_free_minutes. Leave inside the window and nobody pays. Overstay it and
// the excess is priced by the normal plan and billed to the tenant of the most
// recent stamp as a TenantBill — the guest is never charged either way.
//
// Everything here is derived on the client from /parking/sessions, which
// already serializes stamps[], total_stamp_minutes and tenant_bill on every
// session and is not paginated. There is no Statement model on the backend and
// TenantBill carries no paid/unpaid flag, so these figures are accrued
// charges, never a settled balance.

import dayjs, { type Dayjs } from 'dayjs';

export interface SessionStamp {
  id: number;
  // Vendor.name — the API serializes stamps' and bills' vendor as a string,
  // not an id. Vendor.name is unique, so it is safe to key tenants by it.
  vendor: string;
  free_minutes_granted: number;
  stamped_at: string;
}

export interface SessionTenantBill {
  id: number;
  // The tenant actually charged: the vendor of the ticket's most recent stamp.
  vendor: string;
  overage_minutes: number;
  amount: string;
  created_at: string;
}

export interface SessionRow {
  id: string;
  ticket_number: string;
  license_plate: string;
  vehicle_type: string | null;
  registered_staff_member: string | null;
  entry_time: string;
  exit_time: string | null;
  duration_minutes: number | null;
  status: string;
  stamps: SessionStamp[];
  total_stamp_minutes: number;
  tenant_bill: SessionTenantBill | null;
}

export interface VendorRow {
  id: number;
  name: string;
  location: string;
  contact_person: string;
  contact_email: string;
  stamp_free_minutes: number;
}

// One guest visit as it appears under one tenant. A ticket stamped by two
// tenants produces two of these — both tenants hosted the guest — but only the
// one the backend charged carries `billed`, `overageMinutes` and `amount`.
export interface VisitRow {
  sessionId: string;
  ticket: string;
  plate: string;
  vehicleType: string | null;
  entry: string;
  exit: string | null;
  // Minutes actually parked. Taken from duration_minutes, which the backend
  // only fills in at exit — these rows are completed exits, so it is set.
  stayedMinutes: number;
  // Free minutes the whole ticket carried, summed across all of its stamps.
  freeMinutes: number;
  stampedAt: string;
  overageMinutes: number;
  amount: number;
  billed: boolean;
  // >1 means other tenants stamped the same ticket. The guest is counted under
  // each of them, so the row is flagged rather than silently double-counted.
  stamperNames: string[];
}

export interface TenantStatementRow {
  key: string;
  name: string;
  vendor: VendorRow | null;
  visits: VisitRow[];
  // Every stamped guest, including the ones who stayed inside the free window.
  guests: number;
  // Guests this tenant was billed for.
  overstays: number;
  overageMinutes: number;
  amount: number;
}

export interface LiveTotals {
  stillParked: number;
  alreadyOver: number;
  accrued: number;
}

export const PAGE_SIZE = 10;

// --- period selection -------------------------------------------------------

export type PeriodKey = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_30' | 'ALL' | string;

export interface Period {
  start: Dayjs | null;
  end: Dayjs | null;
  label: string;
  // Short form for filenames and the printed statement header.
  slug: string;
}

const MONTH_PREFIX = 'M:';

export const monthKey = (d: Dayjs) => `${MONTH_PREFIX}${d.format('YYYY-MM')}`;

export const resolvePeriod = (key: PeriodKey, now: Dayjs = dayjs()): Period => {
  if (key.startsWith(MONTH_PREFIX)) {
    // `${ym}-01` rather than a format string: customParseFormat is not
    // registered globally and the default parser handles ISO fine.
    const m = dayjs(`${key.slice(MONTH_PREFIX.length)}-01`);
    return {
      start: m.startOf('month'),
      end: m.endOf('month'),
      label: m.format('MMMM YYYY'),
      slug: m.format('YYYY-MM'),
    };
  }
  switch (key) {
    case 'LAST_MONTH': {
      const m = now.subtract(1, 'month');
      return {
        start: m.startOf('month'),
        end: m.endOf('month'),
        label: `Last month · ${m.format('MMMM YYYY')}`,
        slug: m.format('YYYY-MM'),
      };
    }
    case 'LAST_30':
      return {
        start: now.subtract(30, 'day').startOf('day'),
        end: now.endOf('day'),
        label: 'Last 30 days',
        slug: `last30-${now.format('YYYYMMDD')}`,
      };
    case 'ALL':
      return { start: null, end: null, label: 'All time', slug: 'all-time' };
    case 'THIS_MONTH':
    default:
      return {
        start: now.startOf('month'),
        end: now.endOf('month'),
        label: `This month · ${now.format('MMMM YYYY')}`,
        slug: now.format('YYYY-MM'),
      };
  }
};

// --- formatting -------------------------------------------------------------

export const formatAmount = (value: number) =>
  `Rs. ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const formatMinutes = (mins: number) => {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
};

export const tenantKeyFor = (name: string, vendor: VendorRow | undefined) =>
  vendor ? String(vendor.id) : `name:${name}`;
