import { cn } from '@/lib/utils';
import { STATUS, type SessionStatus } from '@/components/sessions/session';

export function StatusLabel({ status, className }: { status: SessionStatus; className?: string }) {
  const cfg = STATUS[status];
  return (
    <span className={cn('inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-foreground', className)}>
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

// Plates are what staff scan for, so they read like a plate: monospaced,
// tracked out, on a light keyline. They never truncate — a clipped plate is a
// wrong plate — so the layout around them gives way instead.
export function Plate({ value, size = 'sm' }: { value: string | null; size?: 'sm' | 'lg' }) {
  if (!value) {
    return (
      <span className={cn('whitespace-nowrap text-muted-foreground', size === 'lg' ? 'text-base' : 'text-[13px]')}>
        No plate
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-border bg-background font-mono leading-none font-medium tracking-[0.06em] text-foreground uppercase',
        size === 'lg' ? 'h-9 px-2.5 text-lg' : 'h-6 px-1.5 text-[12px]'
      )}
    >
      {value}
    </span>
  );
}
