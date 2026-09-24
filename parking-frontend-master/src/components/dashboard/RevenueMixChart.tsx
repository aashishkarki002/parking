import { TrendingDown, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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
        <Skeleton className="h-3.5 w-52" />
      </CardHeader>
      <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
        <div className="flex h-[220px] items-end justify-between gap-2 border-b border-border px-1 pb-6">
          {heights.map((h, i) => (
            <Skeleton key={i} className="w-full rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="mt-2 flex justify-center gap-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </CardContent>
      <CardFooter className="flex-col items-start gap-1 p-4 pt-0 text-sm sm:p-6 sm:pt-0">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="mt-1 h-3.5 w-48" />
      </CardFooter>
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
  const shareUp = digitalShareDeltaPts >= 0;
  const TrendIcon = shareUp ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 p-4 pb-2 sm:p-6 sm:pb-3">
        <CardTitle className="text-base font-semibold text-foreground">Revenue by {bucketNoun}</CardTitle>
        <CardDescription>
          {scopeLabel.charAt(0).toUpperCase() + scopeLabel.slice(1)}, split by payment method
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
        <ChartContainer config={revenueChartConfig} className="aspect-auto h-[220px] w-full">
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} tickMargin={10} axisLine={false} interval="preserveStartEnd" />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="cash" stackId="revenue" fill="var(--color-cash)" radius={[0, 0, 4, 4]} />
            <Bar dataKey="digital" stackId="revenue" fill="var(--color-digital)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-1 p-4 pt-0 text-sm sm:p-6 sm:pt-0">
        <div className="flex items-center gap-2 leading-none font-medium text-foreground">
          Digital share {shareUp ? 'up' : 'down'} {Math.abs(digitalShareDeltaPts).toFixed(1)} pts vs {comparisonLabel}
          <TrendIcon className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          {formatNRs(total)} collected {scopeLabel} — {digitalSharePct.toFixed(0)}% online/QR
        </div>
      </CardFooter>
    </Card>
  );
}
