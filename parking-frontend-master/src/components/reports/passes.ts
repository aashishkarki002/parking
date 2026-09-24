// Monthly-pass fee revenue earned inside a reporting window.
//
// A pass is paid once for a term — usually a month, sometimes three or six — so
// the fee belongs to the whole term, not to the day it was taken. To sit beside
// session figures for one window, the fee is apportioned by how much of the
// term falls inside that window: a NRs 5,000 monthly pass contributes about
// NRs 1,600 to a ten-day range.
//
// That is an allocation, not a cash-flow figure — the money may have arrived in
// a different month — and the UI has to say so wherever this number appears.

export interface PassRow {
  id: number;
  valid_from: string;
  valid_until: string;
  price_paid: string;
  is_active: boolean;
}

export interface PassFeeSummary {
  /** Fees apportioned to the window. */
  feesEarned: number;
  /** Passes whose term overlaps the window at all. */
  passes: number;
  /** Full term price of those passes, for "NRs 5,000 a month" style copy. */
  fullTermValue: number;
}

const EMPTY: PassFeeSummary = { feesEarned: 0, passes: 0, fullTermValue: 0 };

const num = (value: string | number | null | undefined) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function passFeesInWindow(
  passes: PassRow[] | undefined,
  start: Date,
  end: Date
): PassFeeSummary {
  if (!passes || passes.length === 0) return EMPTY;

  const windowStart = start.getTime();
  const windowEnd = end.getTime();
  const summary: PassFeeSummary = { ...EMPTY };

  for (const pass of passes) {
    // An inactive pass is still honoured for the term already paid for, so it
    // keeps earning until its end date — `is_active` governs renewal, not this.
    const from = new Date(pass.valid_from).getTime();
    const until = new Date(pass.valid_until).getTime();
    const term = until - from;
    if (!Number.isFinite(term) || term <= 0) continue;

    const overlap = Math.min(until, windowEnd) - Math.max(from, windowStart);
    if (overlap <= 0) continue;

    summary.passes += 1;
    summary.fullTermValue += num(pass.price_paid);
    summary.feesEarned += num(pass.price_paid) * (overlap / term);
  }

  return summary;
}
