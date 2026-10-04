import { CreditCard } from 'lucide-react';
import { InsightCard } from '@/components/reports/ReportPanel';
import { formatMoney, type ReportMetrics } from '@/components/reports/metrics';
import type { PassFeeSummary } from '@/components/reports/passes';

interface PassInsightProps {
  current: ReportMetrics;
  passFees: PassFeeSummary;
  currency: string;
  scopeLabel: string;
  className?: string;
}

/**
 * Is the monthly pass priced right? Answered as a verdict, then shown as two
 * bars on one scale so the gap the verdict names is the visible difference.
 *
 * Pass parking is not a loss, since the fee was paid, but the fee is fixed while
 * usage is not. Both figures are estimates in opposite directions: fees are
 * apportioned across terms that straddle the window, and gate value assumes a
 * holder would have parked the same way on a ticket. The gap is a pricing
 * question, never leakage.
 */
export function PassInsight({ current, passFees, currency, scopeLabel, className }: PassInsightProps) {
  const money = (amount: number) => formatMoney(amount, currency);
  const gap = current.passValue - passFees.feesEarned;
  const coverPct = current.passValue > 0 ? (passFees.feesEarned / current.passValue) * 100 : null;
  const scale = Math.max(current.passValue, passFees.feesEarned, 1);

  const headline =
    passFees.passes === 0
      ? 'No pass fees fall in this window.'
      : gap > 0
        ? 'Passes are priced below what holders use.'
        : 'Passes are paying their way.';

  const detail =
    passFees.passes === 0 ? (
      <>Holders still parked {money(current.passValue)} at gate rates {scopeLabel}.</>
    ) : gap > 0 ? (
      <>
        Fees cover {coverPct === null ? 'none' : `${coverPct.toFixed(0)}%`} of the parking holders
        used at gate rates, a gap of {money(gap)} {scopeLabel}.
      </>
    ) : (
      <>
        {passFees.passes} {passFees.passes === 1 ? 'pass' : 'passes'} brought in {money(passFees.feesEarned)},
        more than the {money(current.passValue)} the same parking would cost on tickets.
      </>
    );

  const bars = [
    {
      label: 'Used at gate rates',
      value: current.passValue,
      color: 'var(--chart-2)',
    },
    {
      label: 'Fees received',
      value: passFees.feesEarned,
      color: 'var(--chart-1)',
    },
  ];

  return (
    <InsightCard
      className={className}
      icon={CreditCard}
      category="Monthly passes"
      tint="var(--chart-1)"
      headline={headline}
      detail={detail}
      action={gap > 0 ? { to: '/subscription', label: 'Review pass pricing' } : undefined}
    >
      <dl className="flex flex-col gap-3">
        {bars.map((bar, index) => (
          <div key={bar.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <dt className="text-foreground/80">{bar.label}</dt>
              <dd className="shrink-0 font-semibold tabular-nums text-foreground">{money(bar.value)}</dd>
            </div>
            <span className="block h-1.5">
              <span
                className="bar-reveal block h-full rounded-full"
                style={{
                  width: `${Math.max((bar.value / scale) * 100, 2)}%`,
                  background: bar.color,
                  ['--bar-delay' as string]: `${index * 60}ms`,
                }}
              />
            </span>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11.5px] text-muted-foreground">
        {current.passSessions} {current.passSessions === 1 ? 'session' : 'sessions'} by{' '}
        {current.passVehicles} {current.passVehicles === 1 ? 'vehicle' : 'vehicles'}. Fees are counted
        for the part of each term inside this window.
      </p>
    </InsightCard>
  );
}
