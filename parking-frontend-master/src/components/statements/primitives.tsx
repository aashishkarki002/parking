import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function KpiTile({
  label,
  value,
  caption,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  caption: ReactNode;
  tone?: 'danger' | 'warning';
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-card p-4">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'text-[26px] leading-none font-bold tracking-tight tabular-nums',
          tone === 'danger'
            ? 'text-destructive'
            : tone === 'warning'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-foreground'
        )}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{caption}</span>
    </div>
  );
}

// A stamped ticket either stayed inside the free window the tenant granted, or
// it did not. Nothing in between, so the pill is binary rather than a scale.
export function CoveragePill({ billed }: { billed: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        billed
          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400'
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {billed ? 'Overstayed' : 'Covered'}
    </span>
  );
}

// Only the tenant of the most recent stamp is charged, so a ticket several
// tenants stamped shows under all of them but bills just one. Flagging it here
// is what makes the guest counts explainable when a tenant queries the bill.
export function SharedFlag({ stampers, name }: { stampers: string[]; name: string }) {
  if (stampers.length <= 1) return null;
  const others = stampers.filter((s) => s !== name);
  return (
    <span
      className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground whitespace-nowrap"
      title={`Also stamped by ${others.join(', ')}`}
    >
      Shared · {stampers.length} stamps
    </span>
  );
}

// Free minutes granted vs minutes actually parked, as one bar. The overage is
// the part that turns into money, so it is the part that gets the colour.
export function StayBar({ stayed, free }: { stayed: number; free: number }) {
  const total = Math.max(stayed, free, 1);
  const covered = Math.min(stayed, free);
  const over = Math.max(0, stayed - free);
  return (
    <span className="flex h-1.5 w-full min-w-[72px] overflow-hidden rounded-full bg-muted">
      <span className="block h-full bg-emerald-500" style={{ width: `${(covered / total) * 100}%` }} />
      {over > 0 && (
        <span className="block h-full bg-amber-500" style={{ width: `${(over / total) * 100}%` }} />
      )}
    </span>
  );
}
