import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function KpiTile({
  label,
  value,
  caption,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  caption: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5 bg-card p-4', className)}>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{label}</span>
      <span className="text-[26px] leading-none font-bold tracking-tight tabular-nums text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{caption}</span>
    </div>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        active
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400'
          : 'border-border bg-muted text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          active ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-muted-foreground'
        )}
      />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export function GatePill({ allowed }: { allowed: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        allowed
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400'
          : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400'
      )}
    >
      {allowed ? 'Allowed' : 'Blocked'}
    </span>
  );
}

// Quota is pushed in from EasyManage; a quota of 0 means "never synced", not
// "no slots", so the meter falls back to a plain count instead of claiming the
// tenant is over its limit. `used` above a real quota is still possible for
// historical rows — the bar clamps, the numbers stay honest.
export function QuotaMeter({ used, quota }: { used: number; quota: number }) {
  if (quota === 0) {
    return (
      <span className="font-mono text-[13px] tabular-nums text-foreground">
        {used}
        <span className="text-muted-foreground"> / —</span>
      </span>
    );
  }

  const over = used > quota;
  const ratio = Math.min(1, used / quota);
  return (
    <div className="flex min-w-[92px] flex-col gap-1">
      <span
        className={cn(
          'font-mono text-[13px] tabular-nums',
          over ? 'text-red-600 dark:text-red-400' : 'text-foreground'
        )}
      >
        {used}
        <span className="text-muted-foreground">/{quota}</span>
      </span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <span
          className={cn(
            'block h-full rounded-full',
            over ? 'bg-red-500' : ratio >= 0.9 ? 'bg-amber-500' : 'bg-primary'
          )}
          style={{ width: `${(over ? 1 : ratio) * 100}%` }}
        />
      </span>
    </div>
  );
}
