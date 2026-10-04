import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

// Matches the dashboard's KPI strip (KpiCell) so every readout in the app
// shares one rhythm: quiet label, hero figure, one-line caption.
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
    <div className={cn('flex min-w-0 flex-col gap-2 bg-card p-4 sm:p-5', className)}>
      <span className="truncate text-[13px] text-muted-foreground">{label}</span>
      <span className="truncate text-2xl leading-none font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </span>
      <span className="truncate text-xs text-muted-foreground">{caption}</span>
    </div>
  );
}

// Loading stand-in with the same box as KpiTile, so the strip does not jump
// when the figures arrive.
export function KpiTileSkeleton() {
  return (
    <div className="flex flex-col gap-2 bg-card p-4 sm:p-5">
      <Skeleton className="h-[19.5px] w-20" />
      <Skeleton className="h-6 w-16" />
      <Skeleton className="h-4 w-28" />
    </div>
  );
}

// "used/quota" with the denominator stepped back, so the eye lands on usage.
// Over-quota reads red; a zero quota (never synced) shows the bare count.
export function QuotaValue({ used, quota }: { used: number; quota: number }) {
  if (quota === 0) return <>{used}</>;
  return (
    <span className={cn(used > quota && 'text-red-600 dark:text-red-400')}>
      {used}
      <span className="text-muted-foreground font-normal">/{quota}</span>
    </span>
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
