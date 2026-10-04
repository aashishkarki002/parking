import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react';
import { formatMoney, formatPct, type ReportMetrics } from '@/components/reports/metrics';
import type { PassFeeSummary } from '@/components/reports/passes';
import { cn } from '@/lib/utils';

// Green took the money at the gate, pale blue was paid for by a monthly pass,
// deep blue got billed back to a tenant, red never arrived. The colours carry
// the meaning here, so they are named rather than taken from the palette by
// index.
const COLLECTED = 'var(--chart-3)';
const SUBSCRIBED = 'var(--chart-2)';
const RECOVERED = 'var(--chart-1)';
const LOST = 'var(--chart-5)';

const pctChange = (current: number, previous: number) =>
  previous > 0 ? ((current - previous) / previous) * 100 : null;

// Less lost revenue is good news, so the arrow's colour follows `goodWhenDown`
// rather than the sign. A rising loss figure must never read as green.
function Delta({ value, goodWhenDown = false }: { value: number | null; goodWhenDown?: boolean }) {
  if (value === null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  const good = goodWhenDown ? !up : up;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-semibold tabular-nums',
        good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {Math.abs(value).toFixed(0)}%
    </span>
  );
}

// A money figure set the way Apple sets a unit beside a reading: the number
// carries the weight, the currency sits smaller and lighter so the eye lands
// on the digits first.
function Amount({ value, currency, className }: { value: number; currency: string; className?: string }) {
  const digits = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(value));
  return (
    <span className={cn('inline-flex items-baseline gap-[0.18em] tabular-nums', className)}>
      <span className="text-[0.42em] font-medium tracking-normal text-muted-foreground">{currency}</span>
      {digits}
    </span>
  );
}

const RING_SIZE = 112;
const RING_STROKE = 12;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * Capture rate as an Activity-style ring: the chargeable value is the goal, and
 * the ring closes as more of it was actually collected. A completion question
 * gets a completion shape, which a bare percentage does not convey at a glance.
 *
 * The track is the same hue at low strength, as on the Watch, so the ring reads
 * as one object partially filled rather than two colours side by side. It fills
 * once on arrival from empty, on a critically damped curve: no overshoot,
 * because nothing the user did carried momentum.
 */
function CaptureRing({ pct }: { pct: number }) {
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const clamped = Math.min(Math.max(pct, 0), 100);
  const offset = RING_LENGTH * (1 - (filled ? clamped : 0) / 100);

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        className="-rotate-90"
        role="img"
        aria-label={`${formatPct(pct)} of chargeable value collected`}
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={COLLECTED}
          strokeOpacity={0.16}
          strokeWidth={RING_STROKE}
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke={COLLECTED}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-[900ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">
          {formatPct(pct)}
        </span>
        <span className="mt-1 text-[11px] font-medium text-muted-foreground">captured</span>
      </div>
    </div>
  );
}

interface RevenueHeadlineProps {
  current: ReportMetrics;
  previous: ReportMetrics;
  /** Pass fees apportioned to this window — see passes.ts. */
  passFees: PassFeeSummary;
  currency: string;
  /** "this month", "Sep 1 – Sep 7" — reads inside a sentence. */
  scopeLabel: string;
  comparisonLabel: string;
}

/**
 * The page's answer, in one block: what was collected, and how the rest of the
 * parking's full-rate value was disposed of.
 *
 * Four lanes, and only the last one is a loss. Monthly-pass parking and tenant
 * overage billing were both paid for — on a subscription and on a tenant
 * invoice — so they sit in their own lanes rather than inflating the red one.
 *
 * The bar normalises to the sum of its own parts rather than to `grossValue`.
 * Those differ by the minimum-charge uplift — money taken *above* plan value on
 * short stays — which would push the bar past 100% if gross were the
 * denominator. The exact reconciliation, uplift included, is one click away
 * under "Accounting detail" instead of being forced on every reader.
 */
export function RevenueHeadline({
  current,
  previous,
  passFees,
  currency,
  scopeLabel,
  comparisonLabel,
}: RevenueHeadlineProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const money = (amount: number) => formatMoney(amount, currency);

  const parts: {
    key: string;
    label: string;
    value: number;
    color: string;
    note?: string;
    delta?: number | null;
  }[] = [
    { key: 'collected', label: 'Collected at the gate', value: current.collected, color: COLLECTED },
    {
      key: 'passes',
      label: 'Covered by monthly passes',
      value: current.passValue,
      color: SUBSCRIBED,
      note: passFees.passes > 0 ? `${money(passFees.feesEarned)} in fees` : 'Paid monthly, not at the gate',
    },
    {
      key: 'recovered',
      label: 'Billed to tenants',
      value: current.recoveredFromTenants,
      color: RECOVERED,
    },
    {
      key: 'lost',
      label: 'Net revenue lost',
      value: current.netLost,
      color: LOST,
      delta: pctChange(current.netLost, previous.netLost),
    },
  ];

  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const share = (value: number) => (total > 0 ? (value / total) * 100 : 0);

  const detailRows = [
    {
      label: 'Gross value at full rate',
      value: money(current.grossValue),
      hint: `${current.exited} exited sessions`,
    },
    {
      label: 'Collected in cash / digital',
      value: `${money(current.cashCollected)} · ${money(current.digitalCollected)}`,
    },
    {
      label: 'Pass-covered value',
      value: money(current.passValue),
      hint: `${current.passSessions} sessions on a monthly pass, paid for and not lost`,
    },
    {
      label: 'Pass fees for this period',
      value: money(passFees.feesEarned),
      hint: `Apportioned from ${passFees.passes} ${passFees.passes === 1 ? 'pass' : 'passes'} by how much of each term falls inside it`,
    },
    {
      label: 'Never charged, any reason',
      value: money(current.foregone),
      hint: 'Pass-covered value included',
    },
    {
      label: 'Leakage',
      value: money(current.leakage),
      hint: 'Never charged and no subscription behind it',
    },
    {
      label: 'Free minutes given away',
      value: money(current.freeMinutesValue),
      hint: 'Grace, coupons and tenant stamps',
    },
    {
      label: 'Minimum-charge uplift',
      value: money(current.minimumSurcharge),
      hint: 'Charged above plan value on short stays',
    },
    {
      label: 'Charged but not yet paid',
      value: money(current.unpaidValue),
    },
  ];

  // The bar and the legend are two views of one breakdown, so pointing at
  // either one picks out the lane in both. Hover is instant: it is feedback on
  // where the pointer already is, not a transition to wait for.
  const [focused, setFocused] = useState<string | null>(null);
  const visibleParts = parts.filter((part) => part.value > 0);

  return (
    <section className="flex flex-col rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-10 sm:p-6">
        <div className="flex min-w-0 flex-col">
          <span className="text-[13px] font-semibold text-muted-foreground">
            Collected at the gate {scopeLabel}
          </span>
          <Amount
            value={current.collected}
            currency={currency}
            className="mt-1.5 text-[44px] font-semibold leading-[1.05] tracking-[-0.035em] text-foreground sm:text-[56px]"
          />
          <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-muted-foreground">
            <Delta value={pctChange(current.collected, previous.collected)} />
            <span>from {comparisonLabel}</span>
          </p>
          <p className="mt-4 max-w-[52ch] text-[13px] leading-relaxed text-muted-foreground">
            {current.chargeableValue > 0 ? (
              <>
                <span className="font-medium text-foreground">{money(current.chargeableValue)}</span> was
                chargeable at the gate.
              </>
            ) : (
              <>Nothing was chargeable at the gate {scopeLabel}.</>
            )}
            {current.passValue > 0 && (
              <>
                {' '}
                Pass holders used another {money(current.passValue)}, billed on their subscription.
              </>
            )}
          </p>
        </div>

        {current.chargeableValue > 0 && <CaptureRing pct={current.chargeableCaptureRate} />}
      </div>

      {total > 0 && (
        <div className="flex flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
          {/* Separate rounded segments with a hairline gap, as Apple Card draws
              spending by category: each lane reads as its own piece of the
              whole, and a thin lane still has a visible end cap. */}
          <div
            className="bar-reveal flex h-2.5 w-full gap-[3px]"
            role="img"
            aria-label={visibleParts
              .map((part) => `${part.label} ${formatPct(share(part.value))}`)
              .join(', ')}
            onPointerLeave={() => setFocused(null)}
          >
            {visibleParts.map((part) => (
              <span
                key={part.key}
                onPointerEnter={() => setFocused(part.key)}
                className="h-full rounded-full transition-opacity duration-150 ease-out"
                style={{
                  flexGrow: part.value,
                  flexBasis: 0,
                  minWidth: 6,
                  background: part.color,
                  opacity: focused && focused !== part.key ? 0.25 : 1,
                }}
              />
            ))}
          </div>

          <dl
            className="grid grid-cols-1 gap-x-8 sm:grid-cols-2"
            onPointerLeave={() => setFocused(null)}
          >
            {parts.map((part) => {
              const dimmed = focused !== null && focused !== part.key;
              return (
                <div
                  key={part.key}
                  onPointerEnter={() => setFocused(part.key)}
                  className={cn(
                    'flex items-center gap-3 border-b border-border/60 py-3 transition-opacity duration-150 ease-out',
                    dimmed && 'opacity-45'
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: part.color }}
                  />
                  <dt className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13.5px] font-medium text-foreground">{part.label}</span>
                    {part.note && (
                      <span className="truncate text-[11.5px] text-muted-foreground">{part.note}</span>
                    )}
                  </dt>
                  <dd className="flex shrink-0 flex-col items-end">
                    <span className="text-[15px] font-semibold tracking-[-0.01em] tabular-nums text-foreground">
                      {money(part.value)}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11.5px] tabular-nums text-muted-foreground">
                      {part.delta !== undefined && <Delta value={part.delta} goodWhenDown />}
                      {formatPct(share(part.value))}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-5 py-3 text-[12.5px] text-muted-foreground sm:px-6">
        <span className="tabular-nums">
          {current.exited} of {current.sessions} visits completed
          {current.stillParked > 0 && `, ${current.stillParked} still parked`}
        </span>
        <button
          type="button"
          onClick={() => setDetailOpen((open) => !open)}
          aria-expanded={detailOpen}
          className="-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-medium text-primary outline-none transition-[transform,background-color] duration-100 ease-out hover:bg-primary/8 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
        >
          {detailOpen ? 'Hide details' : 'Show details'}
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform duration-200 ease-[cubic-bezier(0.77,0,0.175,1)]',
              detailOpen && 'rotate-180'
            )}
          />
        </button>
      </div>

      {detailOpen && (
        <div className="scope-fade flex flex-col gap-3 border-t border-border px-5 py-4 sm:px-6">
          <dl className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
            {detailRows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2.5"
              >
                <dt className="min-w-0 text-[12.5px] text-foreground/80">
                  {row.label}
                  {row.hint && (
                    <span className="block text-[11.5px] text-muted-foreground">{row.hint}</span>
                  )}
                </dt>
                <dd className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="max-w-[80ch] text-[11.5px] leading-snug text-muted-foreground">
            Gross less collected reconciles exactly to revenue foregone less the minimum-charge
            uplift. Money figures cover exited sessions only.
          </p>
        </div>
      )}
    </section>
  );
}
