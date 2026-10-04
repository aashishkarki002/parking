import { useMemo, useState, type CSSProperties } from 'react';
import { Building2 } from 'lucide-react';
import { InsightCard, ShowMore } from '@/components/reports/ReportPanel';
import { formatMinutes, formatMoney, type ReportMetrics } from '@/components/reports/metrics';
import { cn } from '@/lib/utils';

const TOP = 3;

interface TenantInsightProps {
  current: ReportMetrics;
  currency: string;
  className?: string;
}

/**
 * Tenant validation, answered as "who do I need to talk to". If any tenant ran
 * past what their stamps covered, the amount to bill is the headline, since
 * that is money to collect. Otherwise the headline is whoever gave away the
 * most parking. Tenants are ranked by what they owe, then by free time given.
 */
export function TenantInsight({ current, currency, className }: TenantInsightProps) {
  const [open, setOpen] = useState(false);
  const money = (amount: number) => formatMoney(amount, currency);

  const ranked = useMemo(
    () =>
      [...current.tenants].sort(
        (a, b) => b.amountBilled - a.amountBilled || b.freeMinutesGranted - a.freeMinutesGranted
      ),
    [current.tenants]
  );

  if (ranked.length === 0) {
    return (
      <InsightCard
        className={className}
        icon={Building2}
        category="Tenants"
        tint="var(--chart-4)"
        headline="No tickets were stamped."
        detail="Tenants stamp a visitor’s ticket to cover their parking. None did in this period."
      />
    );
  }

  const owing = ranked.filter((t) => t.amountBilled > 0);
  const totalBilled = owing.reduce((sum, t) => sum + t.amountBilled, 0);
  const [top] = ranked;
  const rows = open ? ranked : ranked.slice(0, TOP);

  return (
    <InsightCard
      className={className}
      icon={Building2}
      category="Tenants"
      tint="var(--chart-4)"
      headline={
        totalBilled > 0 ? (
          <>
            {money(totalBilled)} to bill {owing.length === 1 ? top.vendor : `across ${owing.length} tenants`}.
          </>
        ) : (
          <>{top.vendor} gave away the most parking.</>
        )
      }
      detail={
        <>
          {ranked.length} {ranked.length === 1 ? 'tenant' : 'tenants'} stamped {current.sessionsValidated}{' '}
          {current.sessionsValidated === 1 ? 'ticket' : 'tickets'}, giving away{' '}
          {formatMinutes(current.freeMinutesGranted)}. Time past a stamp is billed to the tenant, never
          the visitor.
        </>
      }
      action={{ to: '/tenants', label: 'Open tenants' }}
    >
      <ul className="-my-2.5 flex flex-col">
        {rows.map((tenant, index) => (
          <li
            key={tenant.vendor}
            className={cn(
              'flex items-center justify-between gap-4 border-b border-border/60 py-2.5 last:border-0',
              index >= TOP && 'scope-fade'
            )}
            style={
              index >= TOP
                ? ({ '--stagger': `${Math.min(index - TOP, 10) * 30}ms` } as CSSProperties)
                : undefined
            }
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13.5px] font-medium text-foreground">{tenant.vendor}</span>
              <span className="truncate text-[12px] tabular-nums text-muted-foreground">
                {tenant.stamps} {tenant.stamps === 1 ? 'stamp' : 'stamps'},{' '}
                {formatMinutes(tenant.freeMinutesGranted)} free
                {tenant.overageMinutes > 0 && `, ${formatMinutes(tenant.overageMinutes)} over`}
              </span>
            </div>
            {tenant.amountBilled > 0 ? (
              <span className="shrink-0 text-[13.5px] font-semibold tabular-nums text-foreground">
                {money(tenant.amountBilled)}
              </span>
            ) : (
              <span className="shrink-0 text-[12px] text-muted-foreground">Nothing owed</span>
            )}
          </li>
        ))}
      </ul>
      {ranked.length > TOP && (
        <ShowMore open={open} onToggle={() => setOpen((o) => !o)} count={ranked.length} noun="tenants" />
      )}
    </InsightCard>
  );
}
