import { useEffect, useState } from 'react';
import type { MixSegment } from '@/components/dashboard/mix-types';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface MixCardProps {
  title: string;
  subtitle?: string;
  segments: MixSegment[];
  /** Overrides the ring's center figure; defaults to the segment total. */
  centerLabel?: string;
  /** Word under the center figure. */
  centerCaption?: string;
  emptyText?: string;
}

const SIZE = 112;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
// Visible gap between neighbouring arcs. Round caps poke STROKE/2 past each
// end of a dash, so the dash itself has to give that back as well.
const GAP = 3;
const CAP_OVERHANG = STROKE;

// The ring draws itself in on a strong ease-out, so most of the arc lands in
// the first ~150ms and the rest settles; the delay matches the row's stagger
// so it sweeps as the card fades in, not before. Never overshoots.
const SWEEP = 'stroke-dasharray 400ms cubic-bezier(0.23, 1, 0.32, 1) var(--stagger, 0ms), opacity 160ms ease';

export function MixCardSkeleton({ legendRows = 3 }: { legendRows?: number }) {
  return (
    <div className="@container flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="ml-auto h-3 w-12" />
      </div>
      <div className="flex flex-col items-center gap-4 @[17rem]:flex-row @[17rem]:gap-5">
        <div
          className="shrink-0 rounded-full border-[10px] border-muted"
          style={{ width: SIZE, height: SIZE }}
        />
        <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
          {Array.from({ length: legendRows }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
              <Skeleton className="h-3 flex-1" style={{ maxWidth: `${75 - i * 12}%` }} />
              <Skeleton className="h-3 w-7 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MixCard({ title, subtitle, segments, centerLabel, centerCaption = 'sessions', emptyText = 'No sessions in this range' }: MixCardProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const [active, setActive] = useState<number | null>(null);

  // Arcs start collapsed and sweep to length once the collapsed state has been
  // painted — a single rAF fires before that first paint, so the browser never
  // sees the start value and the ring just snaps in. The card is remounted
  // when the range changes, so this plays then and only then.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setDrawn(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const single = segments.filter((s) => s.value > 0).length === 1;
  let cursor = 0;
  const arcs = segments.map((seg) => {
    const span = total > 0 ? (seg.value / total) * C : 0;
    const start = cursor;
    cursor += span;
    const len = single ? C : Math.max(span - GAP - CAP_OVERHANG, 0.001);
    return { seg, len, offset: single ? 0 : start + (GAP + CAP_OVERHANG) / 2 };
  });

  const focused = active !== null ? segments[active] : null;

  return (
    <div className="@container flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline gap-2">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {subtitle && <div className="ml-auto text-xs text-muted-foreground">{subtitle}</div>}
      </div>

      <div className="flex flex-col items-center gap-4 @[17rem]:flex-row @[17rem]:gap-5">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="-rotate-90"
            onPointerLeave={() => setActive(null)}
          >
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--muted)" strokeWidth={STROKE} />
            {total > 0 &&
              arcs.map(({ seg, len, offset }, i) =>
                seg.value > 0 ? (
                  <circle
                    key={seg.label}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={R}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={STROKE}
                    strokeLinecap={single ? 'butt' : 'round'}
                    strokeDasharray={`${drawn ? len : 0} ${C}`}
                    strokeDashoffset={-offset}
                    onPointerEnter={() => setActive(i)}
                    className="motion-reduce:!transition-none"
                    style={{
                      transition: SWEEP,
                      opacity: active === null || active === i ? 1 : 0.25,
                    }}
                  />
                ) : null
              )}
          </svg>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
              {focused ? `${focused.pct}%` : (centerLabel ?? total)}
            </span>
            <span className="mt-1 max-w-[72px] truncate text-[11px] leading-none text-muted-foreground">
              {focused ? focused.label : centerCaption}
            </span>
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-1 flex-col gap-2.5" onPointerLeave={() => setActive(null)}>
          {segments.length === 0 && <div className="text-xs text-muted-foreground">{emptyText}</div>}
          {segments.map((seg, i) => (
            <div
              key={seg.label}
              onPointerEnter={() => setActive(i)}
              className={cn(
                'flex items-center gap-2 text-[13px] transition-opacity duration-150',
                active !== null && active !== i && 'opacity-40'
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
              <span className="flex-1 truncate text-foreground">{seg.label}</span>
              <span className="tabular-nums text-muted-foreground">{seg.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
