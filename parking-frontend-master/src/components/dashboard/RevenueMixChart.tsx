import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

// Rough bar heights so the loading state reads as "a bar chart is coming"
// instead of a generic gray rectangle. Deliberately uneven, like real revenue
// data — not a repeating pattern. Cycled to whatever bucket count is asked for.
const SKELETON_BAR_HEIGHTS = [46, 78, 58, 92, 64, 100, 70, 54, 86, 62, 96, 72];

export function RevenueMixChartSkeleton({ bars = 7 }: { bars?: number }) {
  const heights = Array.from({ length: bars }, (_, i) => SKELETON_BAR_HEIGHTS[i % SKELETON_BAR_HEIGHTS.length]);
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 p-4 pb-2 sm:p-6 sm:pb-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-44" />
      </CardHeader>
      <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
        <div className="flex h-[220px] items-end justify-between gap-2 border-b border-border px-1 pb-6">
          {heights.map((h, i) => (
            <Skeleton key={i} className="w-full rounded-t-sm rounded-b-none" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="mt-2 flex justify-center gap-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

const revenueChartConfig = {
  cash: { label: 'Cash', color: 'var(--chart-2)' },
  digital: { label: 'Online / QR', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const formatNRs = (amount: number) =>
  `NRs ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(amount))}`;

interface RevenueMixChartProps {
  data: { label: string; cash: number; digital: number }[];
  total: number;
  digitalSharePct: number;
  digitalShareDeltaPts: number;
  /** e.g. "this week", "Sep 1 – Sep 7" — the window, as the scope bar names it. */
  scopeLabel: string;
  /** e.g. "the same period last month" — what the deltas are measured against. */
  comparisonLabel: string;
  /** What a single bar covers, e.g. "day", "week", "3-hour block". */
  bucketNoun: string;
}

// Stacked cash + digital revenue per bucket of the selected period — the two
// series sum to that bucket's total, so stacking is meaningful (unlike a
// this-period-vs-last-period comparison, which doesn't stack cleanly).
export function RevenueMixChart({
  data,
  total,
  digitalSharePct,
  digitalShareDeltaPts,
  scopeLabel,
  comparisonLabel,
  bucketNoun,
}: RevenueMixChartProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2 sm:p-6 sm:pb-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-sm font-medium text-foreground">Revenue by {bucketNoun}</CardTitle>
          <CardDescription className="text-xs">Cash and online / QR, {scopeLabel}</CardDescription>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold tabular-nums text-foreground">{formatNRs(total)}</div>
          <div className="text-xs tabular-nums text-muted-foreground" title={`Online share vs ${comparisonLabel}`}>
            {digitalSharePct.toFixed(0)}% online
            <span className="mx-1 opacity-40">·</span>
            {digitalShareDeltaPts >= 0 ? '+' : '−'}
            {Math.abs(digitalShareDeltaPts).toFixed(1)} pts
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
        <ChartContainer config={revenueChartConfig} className="aspect-auto h-[220px] w-full">
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} tickMargin={10} axisLine={false} interval="preserveStartEnd" />
            <ChartTooltip isAnimationActive={false} content={<ChartTooltipContent indicator="dot" />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="cash" stackId="revenue" fill="var(--color-cash)" radius={[0, 0, 2, 2]} maxBarSize={40} animationDuration={500} animationEasing="ease-out" />
            <Bar dataKey="digital" stackId="revenue" fill="var(--color-digital)" radius={[2, 2, 0, 0]} maxBarSize={40} animationDuration={500} animationEasing="ease-out" />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
