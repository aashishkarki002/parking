import { useState } from 'react';
import { TrendingDown } from 'lucide-react';
import { InsightCard, ShowMore } from '@/components/reports/ReportPanel';
import {
  formatMoney,
  formatPct,
  type CauseBreakdown,
  type LossCause,
} from '@/components/reports/metrics';

const TOP = 3;

// The cause as the subject of a sentence, and where an admin would go to
// change it. Coupons have no single screen that governs them, so no link.
const CAUSE_COPY: Partial<Record<LossCause, { noun: string; action?: { to: string; label: string } }>> = {
  GRACE: { noun: 'Free grace periods', action: { to: '/pricing-plans', label: 'Review grace periods' } },
  WAIVED: { noun: 'Waivers at the gate', action: { to: '/sessions', label: 'Review sessions' } },
  VALIDATION: { noun: 'Tenant stamps', action: { to: '/tenants', label: 'Review tenants' } },
  COUPON: { noun: 'Coupons' },
};

interface LeakInsightProps {
  causes: CauseBreakdown[];
  leakage: number;
  currency: string;
  className?: string;
}

/**
 * Revenue given away, answered as "what is costing the most". The top cause is
 * the headline because it is the one lever worth pulling first; the next two
 * are shown for scale, and the rest wait behind a disclosure.
 *
 * Monthly-pass parking is excluded (it was paid for, see PassInsight), and each
 * session counts once against its main cause, so the shares are not a linear
 * split of the free minutes. The detail line says that in passing.
 */
export function LeakInsight({ causes, leakage, currency, className }: LeakInsightProps) {
  const [open, setOpen] = useState(false);
  const money = (amount: number) => formatMoney(amount, currency);

  if (causes.length === 0 || leakage <= 0) {
    return (
      <InsightCard
        className={className}
        icon={TrendingDown}
        category="Revenue lost"
        tint="var(--chart-3)"
        headline="Nothing was given away."
        detail="Every session was either charged or covered by a monthly pass."
      />
    );
  }

  const [top] = causes;
  const copy = CAUSE_COPY[top.cause];
  const rows = open ? causes : causes.slice(0, TOP);
  // Bars scale to the top cause, so the picture answers "how much smaller is
  // everything else" rather than restating shares the text already gives.
  const largest = top.foregone || 1;

  return (
    <InsightCard
      className={className}
      icon={TrendingDown}
      category="Revenue lost"
      tint="var(--chart-5)"
      headline={
        causes.length === 1 ? (
          <>{copy?.noun ?? top.label} account for all {money(leakage)} given away.</>
        ) : (
          <>{copy?.noun ?? top.label} cost the most.</>
        )
      }
      detail={
        <>
          {money(top.foregone)} across {top.sessions} {top.sessions === 1 ? 'session' : 'sessions'},{' '}
          {formatPct(top.pct)} of the {money(leakage)} given away. Pass parking is not counted here.
        </>
      }
      action={copy?.action}
    >
      <ul className="flex flex-col gap-3">
        {rows.map((cause, index) => (
          <li key={cause.cause} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className={index === 0 ? 'font-medium text-foreground' : 'text-foreground/80'}>
                {cause.label}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">
                {money(cause.foregone)}
              </span>
            </div>
            <span className="block h-1.5">
              <span
                className="bar-reveal block h-full rounded-full"
                style={{
                  width: `${Math.max((cause.foregone / largest) * 100, 2)}%`,
                  // Only the headline cause carries the card's colour; the rest
                  // are context, so they stay neutral.
                  background: index === 0 ? 'var(--chart-5)' : 'color-mix(in oklab, var(--foreground) 18%, transparent)',
                  ['--bar-delay' as string]: `${index * 40}ms`,
                }}
              />
            </span>
            {cause.recovered > 0 && (
              <span className="text-[11.5px] text-muted-foreground">
                {money(cause.recovered)} of it billed back to tenants
              </span>
            )}
          </li>
        ))}
      </ul>
      {causes.length > TOP && (
        <ShowMore open={open} onToggle={() => setOpen((o) => !o)} count={causes.length} noun="causes" />
      )}
    </InsightCard>
  );
}
