import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { planBuckets, type ResolvedScope } from '@/components/dashboard/scope';
import { computeMetrics, formatMinutes, type ReportSession } from '@/components/reports/metrics';
import {
  buildVehicleClassifier,
  VEHICLE_CLASS_FILTERS,
  vehicleClassFilterLabel,
  type VehicleClassFilter,
} from '@/components/reports/vehicle-class';
import { useGetVehicleTypesQuery } from '@/app/(public)/(pages)/home/_redux/api';

// Series keys double as CSS custom-property names inside ChartContainer
// (`--color-two`), so they stay lowercase.
const chartConfig = {
  two: { label: 'Two-wheeler', color: 'var(--chart-2)' },
  four: { label: 'Four-wheeler', color: 'var(--chart-1)' },
} satisfies ChartConfig;

interface TrafficSectionProps {
  /** Sessions already scoped to the selected period. */
  sessions: ReportSession[];
  resolved: ResolvedScope;
}

/**
 * Arrivals over the selected period as one line per vehicle class, with the
 * same class as a filter.
 *
 * Lines, not a stack: two-wheelers and four-wheelers arrive on different
 * rhythms, and the useful read is which class is driving a peak — a stack hides
 * that by making the upper series' height depend on the lower one. Each line
 * now sits on the same baseline, so they are directly comparable and their
 * crossings are real. `monotone` interpolation never overshoots the points it
 * joins, so a curve cannot imply arrivals the period never had.
 *
 * The lines and the dropdown share one dimension on purpose: the dropdown zooms
 * into a class rather than changing what the chart means, so the mix is
 * readable at a glance and a single class is one click away. Everything below
 * the chart — including the headline counts — follows the filter.
 */
export function TrafficSection({ sessions, resolved }: TrafficSectionProps) {
  const [filter, setFilter] = useState<VehicleClassFilter>('all');

  const { data: vehicleTypes } = useGetVehicleTypesQuery(undefined);
  const classify = useMemo(() => buildVehicleClassifier(vehicleTypes), [vehicleTypes]);

  const filtered = useMemo(
    () => (filter === 'all' ? sessions : sessions.filter((s) => classify(s) === filter)),
    [sessions, filter, classify]
  );

  const metrics = useMemo(() => computeMetrics(filtered), [filtered]);
  const buckets = useMemo(() => planBuckets(resolved.start, resolved.end), [resolved]);

  const data = useMemo(() => {
    const rows = buckets.labels.map((label) => ({ label, two: 0, four: 0 }));
    for (const session of filtered) {
      const index = buckets.indexOf(new Date(session.entry_time));
      if (index >= 0 && index < rows.length) rows[index][classify(session)] += 1;
    }
    return rows;
  }, [filtered, buckets, classify]);

  const series: ('two' | 'four')[] = filter === 'all' ? ['two', 'four'] : [filter];

  const facts = [
    {
      label: 'Unique vehicles',
      value: String(metrics.uniqueVehicles),
      hint: `${metrics.repeatVisits} repeat ${metrics.repeatVisits === 1 ? 'visit' : 'visits'}`,
    },
    {
      label: 'Visitors',
      value: String(metrics.visitorVehicles),
      hint: `${metrics.visitorSessions} entries`,
    },
    {
      label: 'Tenant vehicles',
      value: String(metrics.registeredVehicles),
      hint: `${metrics.registeredSessions} entries`,
    },
    {
      label: 'Average stay',
      value: formatMinutes(metrics.avgDurationMinutes),
      hint: `${metrics.stillParked} still parked`,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-[15px] font-semibold text-foreground">
            Who came through the gate
          </CardTitle>
          <CardDescription className="text-[12.5px] leading-snug">
            {metrics.sessions} {metrics.sessions === 1 ? 'entry' : 'entries'} {resolved.scopeLabel},
            by {buckets.bucketNoun}.
          </CardDescription>
        </div>

        <Select
          value={filter}
          onValueChange={(value) => setFilter((value as VehicleClassFilter) ?? 'all')}
        >
          <SelectTrigger size="sm" className="w-[150px] shrink-0">
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
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {metrics.sessions === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-[12.5px] text-muted-foreground">
            No {vehicleClassFilterLabel(filter).toLowerCase()} entered {resolved.scopeLabel}.
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
            <LineChart accessibilityLayer data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                interval="preserveStartEnd"
              />
              {/* Unstacked lines lose the "height is the total" cue a stack
                  carried, so the count axis has to be readable directly. */}
              <YAxis
                tickLine={false}
                axisLine={false}
                width={28}
                allowDecimals={false}
                tickMargin={4}
              />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              {filter === 'all' && <ChartLegend content={<ChartLegendContent />} />}
              {series.map((key) => (
                <Line
                  key={key}
                  dataKey={key}
                  type="monotone"
                  stroke={`var(--color-${key})`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}

        <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 lg:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="flex flex-col gap-1">
              <dt className="text-[12.5px] text-muted-foreground">{fact.label}</dt>
              <dd className="text-[15px] font-semibold leading-none tabular-nums text-foreground">
                {fact.value}
                <span className="mt-1 block text-[11.5px] font-normal text-muted-foreground">
                  {fact.hint}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
