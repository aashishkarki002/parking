import type { MixSegment } from '@/components/dashboard/mix-types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MixCardProps {
  title: string;
  subtitle?: string;
  segments: MixSegment[];
  centerLabel?: string;
}

const R = 40;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function MixCard({ title, subtitle, segments, centerLabel }: MixCardProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  const arcs = segments.reduce<{ seg: MixSegment; offset: number }[]>((acc, seg) => {
    const prevOffset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].seg.pct : 0;
    return [...acc, { seg, offset: prevOffset }];
  }, []);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {subtitle && <div className="ml-auto text-xs text-muted-foreground">{subtitle}</div>}
      </div>

      <div className="flex items-center justify-center py-1">
        {total === 0 ? (
          <div className="flex h-[104px] w-[104px] items-center justify-center rounded-full border-2 border-dashed border-border text-[10px] text-muted-foreground">
            No data
          </div>
        ) : (
          <svg viewBox="0 0 100 100" className="h-[104px] w-[104px] -rotate-90">
            <circle cx={50} cy={50} r={R} fill="none" stroke="var(--muted)" strokeWidth={12} />
            <TooltipProvider>
              {arcs.map(({ seg, offset }, i) => {
                const len = (seg.pct / 100) * CIRCUMFERENCE;
                return (
                  <Tooltip key={i}>
                    <TooltipTrigger
                      render={
                        <circle
                          cx={50}
                          cy={50}
                          r={R}
                          fill="none"
                          stroke={seg.color}
                          strokeWidth={12}
                          strokeDasharray={`${len} ${CIRCUMFERENCE - len}`}
                          strokeDashoffset={-((offset / 100) * CIRCUMFERENCE)}
                          strokeLinecap={segments.length > 1 ? 'butt' : 'round'}
                          className="cursor-default outline-none"
                        />
                      }
                    />
                    <TooltipContent side="top">
                      {seg.label}: {seg.value} ({seg.pct}%)
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
            {centerLabel && (
              <text
                x={50}
                y={54}
                textAnchor="middle"
                className="rotate-90 fill-foreground font-mono text-[16px] font-bold"
                style={{ transformOrigin: '50px 50px' }}
              >
                {centerLabel}
              </text>
            )}
          </svg>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {segments.length === 0 && <div className="text-xs italic text-muted-foreground">No sessions yet</div>}
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: seg.color }} />
            <span className="flex-1 truncate text-foreground">{seg.label}</span>
            <span className="font-mono font-semibold tabular-nums text-foreground">{seg.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
