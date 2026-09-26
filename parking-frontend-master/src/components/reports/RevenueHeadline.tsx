import { useState } from 'react';
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
// rather than the sign — a rising loss figure must never read as green.
function Delta({ value, goodWhenDown = false }: { value: number | null; goodWhenDown?: boolean }) {
  if (value === null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  const good = goodWhenDown ? !up : up;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11.5px] font-semibold tabular-nums',
        good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(0)}%
    </span>
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
      hint: `${current.passSessions} sessions on a monthly pass — paid for, not lost`,
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

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          Collected at the gate {scopeLabel}
        </span>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[34px] font-bold leading-none tracking-tight tabular-nums text-foreground sm:text-[40px]">
            {money(current.collected)}
          </span>
          <span className="flex items-baseline gap-1.5 text-xs text-muted-foreground">
            <Delta value={pctChange(current.collected, previous.collected)} />
            vs {comparisonLabel}
          </span>
        </div>
        <p className="text-[13px] leading-snug text-muted-foreground">
          {current.chargeableValue > 0 ? (
            <>
              <span className="font-semibold text-foreground">
                {formatPct(current.chargeableCaptureRate)}
              </span>{' '}
              of the {money(current.chargeableValue)} that was chargeable at the gate.
            </>
          ) : (
            <>Nothing was chargeable at the gate {scopeLabel}.</>
          )}
          {current.passValue > 0 && (
            <>
              {' '}
              Pass holders used another {money(current.passValue)} of parking, billed on their
              subscription instead.
            </>
          )}
        </p>
      </div>

      {total > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-muted">
            {parts
              .filter((part) => part.value > 0)
              .map((part) => (
                <span
                  key={part.key}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${share(part.value)}%`,
                    minWidth: 4,
                    background: part.color,
                  }}
                />
              ))}
          </div>

          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {parts.map((part) => (
              <div key={part.key} className="flex flex-col gap-1">
                <dt className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <span
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{ background: part.color }}
                  />
                  {part.label}
                </dt>
                <dd className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[17px] font-semibold leading-none tabular-nums text-foreground">
                    {money(part.value)}
                  </span>
                  <span className="text-[11.5px] tabular-nums text-muted-foreground">
                    {formatPct(share(part.value))}
                  </span>
                  {part.delta !== undefined && <Delta value={part.delta} goodWhenDown />}
                </dd>
                {part.note && (
                  <span className="text-[11.5px] text-muted-foreground">{part.note}</span>
                )}
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3 text-[12.5px] text-muted-foreground">
        <span>
          {current.exited} of {current.sessions} visits completed
          {current.stillParked > 0 && ` · ${current.stillParked} still parked`}
        </span>
        <button
          type="button"
          onClick={() => setDetailOpen((open) => !open)}
          aria-expanded={detailOpen}
          className="inline-flex items-center gap-1 rounded-md text-[12.5px] font-medium text-foreground/80 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Accounting detail
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', detailOpen && 'rotate-180')} />
        </button>
      </div>

      {detailOpen && (
        <div className="flex flex-col gap-3">
          <dl className="overflow-hidden rounded-lg border border-border">
            {detailRows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 border-b border-border px-3 py-2.5 last:border-0"
              >
                <dt className="text-[12.5px] text-muted-foreground">
                  {row.label}
                  {row.hint && (
                    <span className="block text-[11.5px] text-muted-foreground/70">{row.hint}</span>
                  )}
                </dt>
                <dd className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            Gross less collected reconciles exactly to revenue foregone less the minimum-charge
            uplift. Money figures cover exited sessions only.
          </p>
        </div>
      )}
    </section>
  );
}
