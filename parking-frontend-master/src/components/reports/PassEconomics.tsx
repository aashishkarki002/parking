import { formatMoney, type ReportMetrics } from '@/components/reports/metrics';
import type { PassFeeSummary } from '@/components/reports/passes';
import { cn } from '@/lib/utils';

interface PassEconomicsProps {
  current: ReportMetrics;
  passFees: PassFeeSummary;
  currency: string;
  scopeLabel: string;
}

/**
 * Is the monthly pass priced right?
 *
 * Pass parking is not a loss — the fee was paid — but the fee is fixed while
 * usage is not, so the only way to know whether it is priced right is to put the
 * two side by side: what pass holders' parking would have cost at gate rates,
 * against the fees apportioned to the same window. The gap is the subsidy the
 * pass represents, and it is a pricing decision, not leakage.
 *
 * Both figures are estimates in opposite directions — fees are apportioned
 * across terms that straddle the window, and gate value assumes a pass holder
 * would have parked the same way on a ticket — so the card states that rather
 * than presenting the gap as a precise number.
 */
export function PassEconomics({ current, passFees, currency, scopeLabel }: PassEconomicsProps) {
  const money = (amount: number) => formatMoney(amount, currency);

  const gap = current.passValue - passFees.feesEarned;
  const ratio = passFees.feesEarned > 0 ? current.passValue / passFees.feesEarned : null;

  const facts = [
    {
      label: 'Used at gate rates',
      value: money(current.passValue),
      hint: `${current.passSessions} ${current.passSessions === 1 ? 'session' : 'sessions'} by ${current.passVehicles} ${current.passVehicles === 1 ? 'vehicle' : 'vehicles'}`,
    },
    {
      label: 'Pass fees for the period',
      value: money(passFees.feesEarned),
      hint: `${passFees.passes} ${passFees.passes === 1 ? 'pass' : 'passes'} in force`,
    },
    {
      label: gap >= 0 ? 'Priced below usage by' : 'Priced above usage by',
      value: money(Math.abs(gap)),
      hint:
        ratio === null
          ? 'No fees recorded for this window'
          : `Fees cover ${(100 / ratio).toFixed(0)}% of gate value`,
      emphasis: true,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className="flex flex-col gap-1">
            <dt className="text-[12.5px] text-muted-foreground">{fact.label}</dt>
            <dd
              className={cn(
                'text-[17px] font-semibold leading-none tabular-nums text-foreground',
                fact.emphasis && gap > 0 && 'text-amber-600 dark:text-amber-400'
              )}
            >
              {fact.value}
              <span className="mt-1 block text-[11.5px] font-normal text-muted-foreground">
                {fact.hint}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-[11.5px] leading-snug text-muted-foreground">
        {passFees.passes === 0 ? (
          <>No passes were in force {scopeLabel}, so there are no fees to compare against.</>
        ) : gap > 0 ? (
          <>
            Pass holders parked {money(gap)} more than their fees, measured at gate rates — the
            subsidy the pass is meant to give, and a pricing question if it keeps widening. A pass
            fee also buys a guaranteed space, which a gate ticket does not.
          </>
        ) : (
          <>
            Pass fees came in above what the same parking would have cost on tickets, so the pass is
            earning its keep {scopeLabel}.
          </>
        )}{' '}
        Fees are apportioned from each pass's term, so a term straddling this window contributes only
        its overlapping share.
      </p>
    </div>
  );
}
