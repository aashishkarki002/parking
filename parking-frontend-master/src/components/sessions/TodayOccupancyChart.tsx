import { useMemo } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';

export interface OccupancySession {
  entry_time: string;
  exit_time: string | null;
}

interface HourPoint {
  label: string;
  range: string;
  parked: number;
  arrivals: number;
  departures: number;
}

const config = {
  parked: { label: 'Parked', color: 'var(--chart-1)' },
} satisfies ChartConfig;

// One point per hour from midnight to the current hour. `parked` is the count
// on site at the end of that hour (or right now, for the hour still running),
// so the last point always agrees with the "Active now" tile above it.
function buildHours(sessions: OccupancySession[], now: Dayjs): HourPoint[] {
  const dayStart = now.startOf('day');
  const spans = sessions.map((s) => ({
    entry: dayjs(s.entry_time).valueOf(),
    exit: s.exit_time ? dayjs(s.exit_time).valueOf() : Infinity,
  }));

  return Array.from({ length: now.hour() + 1 }, (_, h) => {
    const lo = dayStart.add(h, 'hour');
    const hi = h === now.hour() ? now : lo.add(1, 'hour');
    const loMs = lo.valueOf();
    const hiMs = hi.valueOf();
    let parked = 0;
    let arrivals = 0;
    let departures = 0;
    for (const s of spans) {
      if (s.entry <= hiMs && s.exit > hiMs) parked += 1;
      if (s.entry >= loMs && s.entry < hiMs) arrivals += 1;
      if (s.exit >= loMs && s.exit < hiMs) departures += 1;
    }
    return {
      label: lo.format('HH:mm'),
      range: h === now.hour() ? `${lo.format('HH:mm')} – now` : `${lo.format('HH:mm')} – ${lo.add(1, 'hour').format('HH:mm')}`,
      parked,
      arrivals,
      departures,
    };
  });
}

function HourTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: HourPoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="grid min-w-36 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-2 text-xs shadow-xl">
      <div className="font-medium text-foreground tabular-nums">{p.range}</div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: 'var(--chart-1)' }} />
        <span className="flex-1 text-muted-foreground">Parked</span>
        <span className="font-medium tabular-nums text-foreground">{p.parked}</span>
      </div>
      <div className="flex justify-between gap-4 text-muted-foreground tabular-nums">
        <span>{p.arrivals} in</span>
        <span>{p.departures} out</span>
      </div>
    </div>
  );
}

export function TodayOccupancyChart({ sessions, now }: { sessions: OccupancySession[]; now: Dayjs }) {
  const data = useMemo(() => buildHours(sessions, now), [sessions, now]);
  const peak = data.reduce((best, p) => (p.parked > best.parked ? p : best), data[0]);
  const arrivals = data.reduce((sum, p) => sum + p.arrivals, 0);

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <div className="text-sm font-medium text-foreground">On site today</div>
          <div className="text-xs text-muted-foreground">Vehicles parked, hour by hour</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums text-foreground">
            {peak && peak.parked > 0 ? `Peak ${peak.parked}` : 'Quiet so far'}
          </div>
          <div className="text-xs tabular-nums text-muted-foreground">
            {peak && peak.parked > 0 ? `at ${peak.label} · ` : ''}
            {arrivals} arrival{arrivals === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <ChartContainer config={config} className="aspect-auto h-[148px] w-full">
        <AreaChart accessibilityLayer data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="occupancy-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-parked)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-parked)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <YAxis hide allowDecimals={false} domain={[0, (max: number) => Math.max(4, Math.ceil(max * 1.15))]} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            interval="preserveStartEnd"
          />
          <ChartTooltip cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} content={<HourTooltip />} />
          <Area
            type="monotone"
            dataKey="parked"
            stroke="var(--color-parked)"
            strokeWidth={2}
            fill="url(#occupancy-fill)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
            animationDuration={500}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
