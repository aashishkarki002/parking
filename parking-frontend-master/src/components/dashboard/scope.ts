// The dashboard's time scope: what window the KPIs, charts and mix cards cover,
// and what they are compared against.
//
// Two things this module exists to get right:
//
//  1. Like-for-like comparison. On the 10th of the month, "this month" holds ten
//     days of data. Comparing that against a *full* previous month makes every
//     delta structurally negative for the whole month. So the baseline window is
//     truncated to the same elapsed span: ten days into the previous month.
//
//  2. One resolved answer to "what am I looking at". Every label the dashboard
//     shows about its own scope is derived here, so the header, the KPI footers
//     and the chart copy can never drift apart.

export type PresetKey = 'today' | 'week' | 'month' | 'year';

export type Scope =
  | { kind: 'preset'; key: PresetKey }
  // ISO yyyy-mm-dd, both ends inclusive — the form a date input gives us.
  | { kind: 'custom'; start: string; end: string };

// Ascending by span, deliberately: position is muscle memory, so the order has
// to be monotonic. Single-word labels — "This" carried no information and was
// the reason the mobile segments truncated.
export const PRESETS: { key: PresetKey; label: string; noun: string }[] = [
  { key: 'today', label: 'Today', noun: 'day' },
  { key: 'week', label: 'Week', noun: 'week' },
  { key: 'month', label: 'Month', noun: 'month' },
  { key: 'year', label: 'Year', noun: 'year' },
];

const DAY_MS = 86_400_000;

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const fromISODate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

// `offset` of 0 is the current period, -1 the immediately preceding one.
const presetRange = (key: PresetKey, offset: number, now: Date): [Date, Date] => {
  if (key === 'today') {
    const start = startOfDay(now);
    start.setDate(start.getDate() + offset);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return [start, end];
  }

  if (key === 'week') {
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const start = startOfDay(now);
    start.setDate(start.getDate() + diffToMonday + offset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return [start, end];
  }

  if (key === 'year') {
    return [new Date(now.getFullYear() + offset, 0, 1), new Date(now.getFullYear() + offset + 1, 0, 1)];
  }

  return [
    new Date(now.getFullYear(), now.getMonth() + offset, 1),
    new Date(now.getFullYear(), now.getMonth() + offset + 1, 1),
  ];
};

export interface ResolvedScope {
  /** Window start, inclusive. */
  start: Date;
  /** Window end, exclusive — the full period, even if it hasn't finished yet. */
  end: Date;
  /** Where the data actually stops: min(now, end). */
  cursor: Date;
  /** Baseline window, truncated to the same elapsed span as the current one. */
  prevStart: Date;
  prevEnd: Date;
  /** True once the period has finished, so the comparison is whole-vs-whole. */
  complete: boolean;
  /** "Sep 1 – Sep 10" — the window, spelled out. */
  rangeLabel: string;
  /** "this month", "Sep 1 – Sep 7" — reads inside a sentence. */
  scopeLabel: string;
  /** "the same period last month" — what the deltas are measured against. */
  comparisonLabel: string;
  noun: string;
  spanDays: number;
}

const monthDay = (d: Date, withYear: boolean) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(d);

// Both ends inclusive, so the caller passes the last day *shown*, not the
// exclusive end — "Sep 1 – Sep 10" and not "Sep 1 – Sep 11".
const formatRange = (from: Date, to: Date) => {
  const crossesYear = from.getFullYear() !== to.getFullYear();
  const sameDay = startOfDay(from).getTime() === startOfDay(to).getTime();
  if (sameDay) return monthDay(from, from.getFullYear() !== new Date().getFullYear());
  return `${monthDay(from, crossesYear)} – ${monthDay(to, crossesYear)}`;
};

export function resolveScope(scope: Scope, now: Date = new Date()): ResolvedScope {
  let start: Date;
  let end: Date;
  let prevStart: Date;
  let noun: string;

  if (scope.kind === 'preset') {
    [start, end] = presetRange(scope.key, 0, now);
    [prevStart] = presetRange(scope.key, -1, now);
    noun = PRESETS.find((p) => p.key === scope.key)!.noun;
  } else {
    start = fromISODate(scope.start);
    end = new Date(fromISODate(scope.end));
    end.setDate(end.getDate() + 1); // the input's end date is inclusive
    if (end.getTime() <= start.getTime()) end = new Date(start.getTime() + DAY_MS);
    prevStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
    noun = 'period';
  }

  const cursor = new Date(Math.min(now.getTime(), end.getTime()));
  const complete = now.getTime() >= end.getTime();
  const elapsedMs = Math.max(cursor.getTime() - start.getTime(), 0);
  const prevEnd = new Date(prevStart.getTime() + elapsedMs);
  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));

  // The last day with data in it. `cursor` sits at "now" mid-period and at the
  // exclusive end once the period is over, so step back a day in that case.
  const lastDay = complete ? new Date(end.getTime() - DAY_MS) : cursor;
  const rangeLabel = formatRange(start, lastDay);

  let scopeLabel: string;
  let comparisonLabel: string;

  if (scope.kind === 'custom') {
    const prevSpan = Math.max(1, Math.round(elapsedMs / DAY_MS));
    scopeLabel = rangeLabel;
    comparisonLabel = `the previous ${prevSpan} ${prevSpan === 1 ? 'day' : 'days'}`;
  } else if (scope.key === 'today') {
    scopeLabel = 'today';
    comparisonLabel = 'the same time yesterday';
  } else {
    scopeLabel = `this ${noun}`;
    comparisonLabel = complete ? `last ${noun}` : `the same period last ${noun}`;
  }

  return {
    start,
    end,
    cursor,
    prevStart,
    prevEnd,
    complete,
    rangeLabel,
    scopeLabel,
    comparisonLabel,
    noun,
    spanDays,
  };
}

export const inRange = (iso: string, start: Date, end: Date) => {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
};

// ---------------------------------------------------------------------------
// Bucketing
// ---------------------------------------------------------------------------

export interface BucketPlan {
  labels: string[];
  /** What one bar covers, for the chart's title copy. */
  bucketNoun: string;
  /** Bucket index for a date, or -1 when it falls outside the window. */
  indexOf: (d: Date) => number;
  /** labels.length + 1 instants; bucket i covers [edges[i], edges[i + 1]). */
  edges: Date[];
}

const HOUR_BLOCK_LABELS = ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p'];
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const monthName = new Intl.DateTimeFormat('en-US', { month: 'short' });

// Granularity follows the span, so a custom range gets a sensible number of
// bars for free instead of needing its own hand-written case.
export function planBuckets(start: Date, end: Date): BucketPlan {
  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
  const dayIndex = (d: Date) => Math.round((startOfDay(d).getTime() - start.getTime()) / DAY_MS);
  const addDays = (n: number) => {
    const d = new Date(start);
    d.setDate(d.getDate() + n);
    return d;
  };
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);

  if (spanDays <= 2) {
    const blocks = spanDays * 8;
    return {
      bucketNoun: '3-hour block',
      labels: Array.from({ length: blocks }, (_, i) => HOUR_BLOCK_LABELS[i % 8]),
      indexOf: (d) => {
        const i = Math.floor((d.getTime() - start.getTime()) / (3 * 3_600_000));
        return i >= 0 && i < blocks ? i : -1;
      },
      edges: range(blocks + 1).map((i) => new Date(start.getTime() + i * 3 * 3_600_000)),
    };
  }

  if (spanDays <= 14) {
    const useWeekday = spanDays <= 7;
    return {
      bucketNoun: 'day',
      labels: Array.from({ length: spanDays }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return useWeekday ? weekday.format(d) : monthDay(d, false);
      }),
      indexOf: (d) => {
        const i = dayIndex(d);
        return i >= 0 && i < spanDays ? i : -1;
      },
      edges: range(spanDays + 1).map(addDays),
    };
  }

  if (spanDays <= 92) {
    const weeks = Math.ceil(spanDays / 7);
    return {
      bucketNoun: 'week',
      labels: Array.from({ length: weeks }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i * 7);
        return monthDay(d, false);
      }),
      indexOf: (d) => {
        const i = Math.floor(dayIndex(d) / 7);
        return i >= 0 && i < weeks ? i : -1;
      },
      edges: range(weeks + 1).map((i) => addDays(i * 7)),
    };
  }

  const months = Math.max(
    1,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  );
  return {
    bucketNoun: 'month',
    labels: Array.from({ length: months }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      return monthName.format(d);
    }),
    indexOf: (d) => {
      const i = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth());
      return i >= 0 && i < months ? i : -1;
    },
    edges: range(months + 1).map((i) => new Date(start.getFullYear(), start.getMonth() + i, 1)),
  };
}
