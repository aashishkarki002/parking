'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
} from 'lucide-react';
import { useGetDashboardSummaryQuery, type DashboardCounts } from '@/app/(public)/(pages)/home/_redux/api';
import { AppSidebar } from '@/components/app-sidebar';
import { GlobalSearch } from '@/components/GlobalSearch';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { RevenueMixChart, RevenueMixChartSkeleton } from '@/components/dashboard/RevenueMixChart';
import { MixCard, MixCardSkeleton } from '@/components/dashboard/MixCard';
import { MIX_PALETTE, type MixSegment } from '@/components/dashboard/mix-types';
import { PeriodScopeBar } from '@/components/dashboard/PeriodScopeBar';
import { SessionsTable } from '@/components/dashboard/SessionsTable';
import { planBuckets, resolveScope, type Scope } from '@/components/dashboard/scope';


type Theme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'parkflow-dashboard-theme';

const humanizeLabel = (raw: string) =>
  raw
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

// Keeps the top `maxBuckets` of the server's per-value counts (relabelled by
// `labelFn`), folds the remainder into "Other", and assigns each bucket a
// palette color.
function buildMixSegments(
  rows: DashboardCounts,
  labelFn: (raw: string) => string,
  palette: string[],
  maxBuckets = 3
): MixSegment[] {
  const counts = new Map<string, number>();
  for (const [raw, n] of rows) {
    const key = labelFn(raw);
    counts.set(key, (counts.get(key) || 0) + n);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, maxBuckets);
  const otherTotal = sorted.slice(maxBuckets).reduce((sum, [, v]) => sum + v, 0);
  const buckets: [string, number][] = otherTotal > 0 ? [...top, ['Covered by pass', otherTotal]] : top;
  const total = rows.reduce((sum, [, n]) => sum + n, 0);
  return buckets.map(([label, value], i) => ({
    label,
    value,
    pct: total > 0 ? Math.round((value / total) * 100) : 0,
    color: palette[i % palette.length],
  }));
}

const formatNRs = (amount: number) =>
  `NRs ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(amount))}`;

const pctChange = (current: number, previous: number) =>
  previous > 0 ? ((current - previous) / previous) * 100 : null;

function TrendPill({ value }: { value: number | null }) {
  if (value === null) return null;
  const isUp = value >= 0;
  return (
    <span
      className={cn(
        'shrink-0 text-xs font-medium tabular-nums',
        isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
      )}
    >
      {isUp ? '+' : '−'}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

// One channel of the KPI readout strip — label, hero figure, delta, baseline.
// Kept uniform on purpose: this is a meter bridge, not a set of cards.
function KpiCell({
  label,
  value,
  delta,
  footer,
  loading,
}: {
  label: string;
  value: ReactNode;
  delta: number | null;
  footer: ReactNode;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 bg-card p-4 sm:p-5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-6 w-28" />
      ) : (
        <div className="truncate text-2xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
          {value}
        </div>
      )}
      {loading ? (
        <Skeleton className="h-3.5 w-24" />
      ) : (
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <TrendPill value={delta} />
          <span className="truncate">{footer}</span>
        </div>
      )}
    </div>
  );
}

const DashboardPage = () => {
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>({ kind: 'preset', key: 'today' });

  const [theme] = useState<Theme>(
    () => (localStorage.getItem(THEME_STORAGE_KEY) as Theme | null) ?? 'light'
  );
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  // Everything about "what window am I looking at, and against what" is decided
  // in one place, so the figures, the chart copy and the scope bar can't drift.
  const resolved = useMemo(() => resolveScope(scope), [scope]);
  const buckets = useMemo(() => planBuckets(resolved.start, resolved.end), [resolved]);

  // The server only counts and sums inside the instants we resolve here — the
  // baseline is truncated to the same elapsed span (see scope.ts), otherwise a
  // partial month always loses to a whole one and every delta reads red.
  const summaryArgs = useMemo(
    () => ({
      start: resolved.start.toISOString(),
      end: resolved.end.toISOString(),
      prev_start: resolved.prevStart.toISOString(),
      prev_end: resolved.prevEnd.toISOString(),
      edges: buckets.edges.map((d) => d.toISOString()).join(','),
    }),
    [resolved, buckets]
  );
  // currentData, not data: on a scope change, show skeletons rather than the
  // previous window's figures under the new window's labels.
  const { currentData: summary, isError } = useGetDashboardSummaryQuery(summaryArgs);
  const loading = !summary && !isError;
  const error = isError ? 'Failed to load dashboard data.' : '';

  // A handful of divisions over server totals — not worth memoizing.
  const current = summary?.current ?? { count: 0, revenue: 0, digital: 0 };
  const previous = summary?.previous ?? { count: 0, revenue: 0, digital: 0 };
  const elapsedMs = resolved.cursor.getTime() - resolved.start.getTime();
  const totalMs = resolved.end.getTime() - resolved.start.getTime();
  const elapsedFraction = totalMs > 0 ? Math.min(Math.max(elapsedMs / totalMs, 0.01), 1) : 1;
  const predictedRevenue = current.revenue / elapsedFraction;

  const stats = {
    currentRevenue: current.revenue,
    previousRevenue: previous.revenue,
    revenueChange: pctChange(current.revenue, previous.revenue),
    carsParked: current.count,
    carsParkedPrev: previous.count,
    carsChange: pctChange(current.count, previous.count),
    predictedRevenue,
    predictedChange: pctChange(predictedRevenue, previous.revenue),
    digitalRevenue: current.digital,
    digitalRevenuePrev: previous.digital,
    digitalRevenueChange: pctChange(current.digital, previous.digital),
  };

  // Cash vs. digital revenue, bucketed at whatever granularity the resolved
  // window calls for (see planBuckets), plus this window's digital-payment
  // share against the baseline's. The two series stack to each bucket's total,
  // so a stacked bar is meaningful here.
  const revenueMix = useMemo(() => {
    const data = buckets.labels.map((label, i) => ({
      label,
      cash: summary?.buckets[i]?.cash ?? 0,
      digital: summary?.buckets[i]?.digital ?? 0,
    }));
    const totalDigital = data.reduce((sum, b) => sum + b.digital, 0);
    const total = data.reduce((sum, b) => sum + b.cash, 0) + totalDigital;
    const prevTotal = summary?.previous.revenue ?? 0;
    const prevDigital = summary?.previous.digital ?? 0;
    const digitalSharePct = total > 0 ? (totalDigital / total) * 100 : 0;
    const prevDigitalSharePct = prevTotal > 0 ? (prevDigital / prevTotal) * 100 : 0;

    return { data, total, digitalSharePct, digitalShareDeltaPts: digitalSharePct - prevDigitalSharePct };
  }, [summary, buckets]);

  const mix = useMemo(() => {
    const palette = MIX_PALETTE;
    const counts = summary?.mix ?? { vehicle: [], payment: [], status: [] };
    return {
      vehicle: buildMixSegments(counts.vehicle, (v) => v || 'Unknown', palette, 3),
      payment: buildMixSegments(counts.payment, (p) => p, palette, 4),
      status: buildMixSegments(counts.status, humanizeLabel, palette, 4),
    };
  }, [summary]);
  const scopeKey = scope.kind === 'preset' ? scope.key : `${scope.start}_${scope.end}`;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className={theme === 'dark' ? 'dark' : undefined}>
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="h-8 w-8 shrink-0 rounded-lg border border-border text-foreground/70 hover:bg-muted hover:text-foreground" />
            <h1 className="text-base font-semibold text-foreground">Dashboard</h1>

          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <GlobalSearch />
            <Button onClick={() => navigate('/')} className="w-full gap-1.5 sm:w-auto">
              <Plus className="h-3.5 w-3.5" />
              New session
            </Button>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-6 sm:py-6 ">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          ) : (
            <>
              <PeriodScopeBar scope={scope} onScopeChange={setScope} resolved={resolved} />

              {/* Skeletons appear instantly; the figures fade in once they
                  arrive — whether from the network or straight from cache. */}
              <div key={loading ? 'loading' : scopeKey}>
              <div className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4', !loading && 'scope-fade')}>
                <KpiCell
                  label="Revenue"
                  loading={loading}
                  value={formatNRs(stats.currentRevenue)}
                  delta={stats.revenueChange}
                  footer={<>vs <span className="tabular-nums">{formatNRs(stats.previousRevenue)}</span></>}
                />
                <KpiCell
                  label="Vehicles"
                  loading={loading}
                  value={stats.carsParked}
                  delta={stats.carsChange}
                  footer={<>vs <span className="tabular-nums">{stats.carsParkedPrev}</span></>}
                />
                <KpiCell
                  label="Projected revenue"
                  loading={loading}
                  value={formatNRs(stats.predictedRevenue)}
                  delta={stats.predictedChange}
                  footer={<>vs <span className="tabular-nums">{formatNRs(stats.previousRevenue)}</span></>}
                />
                <KpiCell
                  label="Online / QR revenue"
                  loading={loading}
                  value={formatNRs(stats.digitalRevenue)}
                  delta={stats.digitalRevenueChange}
                  footer={<>vs <span className="tabular-nums">{formatNRs(stats.digitalRevenuePrev)}</span></>}
                />
              </div>

              {loading ? (
                <div className="mt-4">
                  <RevenueMixChartSkeleton bars={buckets.labels.length} />
                </div>
              ) : (
                <div className="scope-fade mt-4 [--stagger:50ms]">
                  <RevenueMixChart
                    data={revenueMix.data}
                    total={revenueMix.total}
                    digitalSharePct={revenueMix.digitalSharePct}
                    digitalShareDeltaPts={revenueMix.digitalShareDeltaPts}
                    scopeLabel={resolved.scopeLabel}
                    comparisonLabel={resolved.comparisonLabel}
                    bucketNoun={buckets.bucketNoun}
                  />
                </div>
              )}

              <div className={cn('mt-4 grid grid-cols-1 gap-4 [--stagger:100ms] sm:grid-cols-3', !loading && 'scope-fade')}>
                {loading ? (
                  <>
                    <MixCardSkeleton legendRows={3} />
                    <MixCardSkeleton legendRows={4} />
                    <MixCardSkeleton legendRows={4} />
                  </>
                ) : (
                  <>
                    <MixCard
                      title="Vehicle mix"
                      subtitle={resolved.scopeLabel}
                      segments={mix.vehicle}
                      centerLabel={String(stats.carsParked)}
                    />
                    <MixCard title="Payment method" subtitle={resolved.scopeLabel} segments={mix.payment} />
                    <MixCard title="Session status" subtitle={resolved.scopeLabel} segments={mix.status} />
                  </>
                )}
              </div>
              </div>

              <SessionsTable
                start={summaryArgs.start}
                end={summaryArgs.end}
                statusCounts={summary?.mix.status ?? []}
                loading={loading}
                scopeLabel={resolved.scopeLabel}
                scopeKey={scopeKey}
              />
            </>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default DashboardPage;