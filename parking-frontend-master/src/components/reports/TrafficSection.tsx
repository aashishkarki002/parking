import { useMemo, useState } from 'react';
import { Bar, BarChart, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';
import { Car } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { BucketPlan, ResolvedScope } from '@/components/dashboard/scope';
import { InsightCard, PanelEmpty } from '@/components/reports/ReportPanel';
import { formatMinutes } from '@/components/reports/metrics';
import {
  VEHICLE_CLASS_FILTERS,
  vehicleClassFilterLabel,
  type VehicleClassFilter,
} from '@/components/reports/vehicle-class';
import type { ReportSummary } from '@/app/(public)/(pages)/home/_redux/api';

const chartConfig = {
  arrivals: { label: 'Arrivals', color: 'var(--chart-3)' },
} satisfies ChartConfig;

// "9a" reads as a chart tick, not in a sentence.
const spokenHour = (label: string) => label.replace(/^(\d+)([ap])$/, '$1 $2m');

function peakSentence(noun: string, label: string) {
  if (noun === '3-hour block') return <>Arrivals peak around {spokenHour(label)}.</>;
  if (noun === 'week') return <>The week of {label} was the busiest.</>;
  return (
    <>
      {label} was the busiest {noun}.
    </>
  );
}

interface TrafficInsightProps {
  /** Per vehicle class, counted server-side into `buckets`. */
  traffic: ReportSummary['traffic'];
  buckets: BucketPlan;
  resolved: ResolvedScope;
  className?: string;
}

/**
 * Traffic, answered as "when is the gate busiest", which is what staffing and
 * pricing decisions hang on. One bar per bucket, the peak in colour and the
 * rest neutral, with the average as a dashed rule so the reader can see how
 * far the peak stands out without reading an axis. The vehicle-class filter
 * zooms the whole card into one class.
 */
export function TrafficInsight({ traffic, buckets, resolved, className }: TrafficInsightProps) {
  const [filter, setFilter] = useState<VehicleClassFilter>('all');
  // Recharts animates in JS, so it can't read the media query the CSS
  // animations use; ask once instead.
  const [reduceMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  const metrics = traffic[filter];
  const data = useMemo(
    () => buckets.labels.map((label, i) => ({ label, arrivals: metrics.arrivals[i] ?? 0 })),
    [buckets, metrics]
  );

  const peakIndex = data.reduce((best, row, i) => (row.arrivals > data[best].arrivals ? i : best), 0);
  const peak = data[peakIndex];
  const average = data.length > 0 ? metrics.sessions / data.length : 0;
  const fourShare =
    filter === 'all' && traffic.all.sessions > 0 ? (traffic.four.sessions / traffic.all.sessions) * 100 : null;

  const control = (
    <Select value={filter} onValueChange={(value) => setFilter((value as VehicleClassFilter) ?? 'all')}>
      <SelectTrigger size="sm" className="w-[140px] shrink-0">
        {/* Base UI hands the raw value to a render function; without one the
            trigger would show the key itself ("two"). */}
        <SelectValue>{(value: VehicleClassFilter) => vehicleClassFilterLabel(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {VEHICLE_CLASS_FILTERS.map((option) => (
          <SelectItem key={option.key} value={option.key}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (metrics.sessions === 0) {
    return (
      <InsightCard
        className={className}
        icon={Car}
        category="Traffic"
        tint="var(--chart-3)"
        control={control}
        headline="No arrivals to show."
      >
        <PanelEmpty>
          No {vehicleClassFilterLabel(filter).toLowerCase()} entered {resolved.scopeLabel}.
        </PanelEmpty>
      </InsightCard>
    );
  }

  return (
    <InsightCard
      className={className}
      icon={Car}
      category="Traffic"
      tint="var(--chart-3)"
      control={control}
      headline={peakSentence(buckets.bucketNoun, peak.label)}
      detail={
        <>
          {peak.arrivals} arrivals, against an average of {average.toFixed(average >= 10 ? 0 : 1)} per{' '}
          {buckets.bucketNoun}. Stays averaged {formatMinutes(metrics.avgDurationMinutes)}
          {fourShare !== null && `, and ${fourShare.toFixed(0)}% were four-wheelers`}.
        </>
      }
    >
      <ChartContainer config={chartConfig} className="aspect-auto h-[160px] w-full">
        <BarChart accessibilityLayer data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
            fontSize={11}
          />
          {/* Hidden, but the average rule needs a y scale to sit on. */}
          <YAxis hide allowDecimals={false} />
          {/* The tooltip tracks the pointer; easing it between bars makes it
              lag behind the hand that's moving it. */}
          <ChartTooltip
            isAnimationActive={false}
            cursor={false}
            content={<ChartTooltipContent hideIndicator />}
          />
          <ReferenceLine
            y={average}
            stroke="var(--muted-foreground)"
            strokeOpacity={0.5}
            strokeDasharray="3 3"
            ifOverflow="extendDomain"
          />
          <Bar
            dataKey="arrivals"
            radius={[4, 4, 1, 1]}
            maxBarSize={28}
            isAnimationActive={!reduceMotion}
            animationDuration={350}
            animationEasing="ease-out"
          >
            {data.map((row, i) => (
              <Cell
                key={row.label + i}
                fill={
                  i === peakIndex
                    ? 'var(--color-arrivals)'
                    : 'color-mix(in oklab, var(--foreground) 14%, transparent)'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      <p className="mt-3 text-[11.5px] tabular-nums text-muted-foreground">
        {metrics.uniqueVehicles} unique {metrics.uniqueVehicles === 1 ? 'vehicle' : 'vehicles'},{' '}
        {metrics.registeredVehicles} of them tenants&rsquo;. {metrics.repeatVisits} repeat{' '}
        {metrics.repeatVisits === 1 ? 'visit' : 'visits'}.
      </p>
    </InsightCard>
  );
}
