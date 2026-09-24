import { MIX_PALETTE } from '@/components/dashboard/mix-types';
import { formatMoney, formatPct, type CauseBreakdown } from '@/components/reports/metrics';

interface LossBreakdownProps {
  causes: CauseBreakdown[];
  currency: string;
}

/**
 * Revenue given away, ranked by cause — the leakage causes only, since
 * pass-covered parking was paid for on a subscription and is reported apart
 * (see metrics.ts and PassEconomics).
 *
 * Each session is attributed whole to a single primary cause rather than split
 * across the free-minute sources it used — tiered brackets and plan minimums
 * make the sources non-linear, so a linear split would be a fabrication. The
 * subtitle says so, because a reader would otherwise assume the shares add up
 * the way a true decomposition would.
 */
export function LossBreakdown({ causes, currency }: LossBreakdownProps) {
  if (causes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">
        Nothing was given away in this period — every session was either charged or covered by a
        pass.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {causes.map((cause, index) => (
        <div key={cause.cause} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: MIX_PALETTE[index % MIX_PALETTE.length] }}
              />
              {cause.label}
              <span className="text-[11.5px] font-normal text-muted-foreground">
                {cause.sessions} {cause.sessions === 1 ? 'session' : 'sessions'}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">
              {formatMoney(cause.foregone, currency)}
              <span className="ml-1.5 font-sans text-[11.5px] font-normal text-muted-foreground">
                {formatPct(cause.pct)}
              </span>
            </span>
          </div>

          <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.max(cause.pct, 1)}%`,
                background: MIX_PALETTE[index % MIX_PALETTE.length],
              }}
            />
          </span>

          {cause.recovered > 0 && (
            <span className="text-[11.5px] text-emerald-600 dark:text-emerald-400">
              {formatMoney(cause.recovered, currency)} recovered by billing tenants for overage
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
