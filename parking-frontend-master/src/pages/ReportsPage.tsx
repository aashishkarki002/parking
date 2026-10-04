import { useMemo, useState } from 'react';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { PeriodScopeBar } from '@/components/dashboard/PeriodScopeBar';
import { planBuckets, resolveScope, type Scope } from '@/components/dashboard/scope';
import { RevenueHeadline } from '@/components/reports/RevenueHeadline';
import { LeakInsight } from '@/components/reports/LossBreakdown';
import { PassInsight } from '@/components/reports/PassEconomics';
import { TrafficInsight } from '@/components/reports/TrafficSection';
import { TenantInsight } from '@/components/reports/TenantValidationTable';
import { useGetReportSummaryQuery } from '@/app/(public)/(pages)/home/_redux/api';
import { useGetConfigurationQuery } from '@/app/(public)/(pages)/settings/_redux/api';
import { cn } from '@/lib/utils';

// Placeholders shaped like the page they stand in for: the headline block,
// the loss / pass pair, then the two full-width panels.
function ReportsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-10">
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-12 w-64" />
            <Skeleton className="h-3.5 w-36" />
          </div>
          <Skeleton className="hidden h-28 w-28 rounded-full sm:block" />
        </div>
        <Skeleton className="h-2.5 w-full rounded-full" />
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="mt-2 h-6 w-28" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:p-6">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="mt-3 h-24 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The detail report: what the parking was worth at full rate, how much of that
 * was actually collected, and where the rest went.
 *
 * Structured as one answer and three follow-ups, in the order a manager asks
 * them — how much did we collect, why did the rest leak, who do I talk to, and
 * who came through the gate. Anything finer than that (cash/digital split,
 * minimum-charge uplift, unpaid balance) sits behind the headline's accounting
 * disclosure rather than on the page.
 *
 * Every figure is computed server-side (management.report_views, a port of
 * reports/metrics.ts) for the window we resolve here, so the page never
 * downloads the session list. Sessions are scoped by entry time, and each
 * figure is compared against the same elapsed span in the previous period
 * (see scope.ts).
 */
const ReportsPage = () => {
  const { data: configData } = useGetConfigurationQuery(undefined);
  const currency: string = configData?.currency_symbol ?? 'NRs';

  const [scope, setScope] = useState<Scope>({ kind: 'preset', key: 'month' });
  // Sampled once per mount so the window cannot shift mid-render.
  const [now] = useState(() => new Date());
  const resolved = useMemo(() => resolveScope(scope, now), [scope, now]);
  const buckets = useMemo(() => planBuckets(resolved.start, resolved.end), [resolved]);

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
  const { currentData: summary, isError } = useGetReportSummaryQuery(summaryArgs);
  const isLoading = !summary && !isError;

  const empty = !!summary && summary.current.sessions === 0;
  const current = summary?.current;
  const previous = summary?.previous;
  const passFees = summary?.passFees;
  const showPasses = !!current && !!passFees && (current.passValue > 0 || passFees.passes > 0);
  // Remounting on a scope change replays the fade, so the eye catches that the
  // figures under the same headings now describe a different window.
  const scopeKey = scope.kind === 'preset' ? scope.key : `${scope.start}_${scope.end}`;

  return (
    <PageShell title="Reports">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
        <PeriodScopeBar scope={scope} onScopeChange={setScope} resolved={resolved} />

        {isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            Failed to load session data.
          </div>
        ) : isLoading || !summary || !current || !previous || !passFees ? (
          <ReportsSkeleton />
        ) : empty ? (
          <EmptyState
            icon={ChartBarIcon}
            title="No sessions in this period"
            description="Pick a wider range, or come back once vehicles have entered."
          />
        ) : (
          <div key={scopeKey} className="flex flex-col gap-4">
            <div className="scope-fade">
              <RevenueHeadline
                current={current}
                previous={previous}
                currency={currency}
                passFees={passFees}
                scopeLabel={resolved.scopeLabel}
                comparisonLabel={resolved.comparisonLabel}
              />
            </div>

            {/* Highlights: one card per decision, each led by its takeaway.
                Ordered by what a manager acts on first: money leaking, money to
                collect, pricing, then staffing. With no pass card the traffic
                card takes the full row, so the grid never leaves a hole. */}
            <div className="scope-fade flex flex-col gap-3 [--stagger:60ms]">
              <h2 className="px-1 text-[20px] font-semibold tracking-[-0.02em] text-foreground">
                Highlights
              </h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <LeakInsight causes={current.leakCauses} leakage={current.leakage} currency={currency} />
                <TenantInsight current={current} currency={currency} />
                {showPasses && (
                  <PassInsight
                    current={current}
                    passFees={passFees}
                    currency={currency}
                    scopeLabel={resolved.scopeLabel}
                  />
                )}
                <TrafficInsight
                  traffic={summary.traffic}
                  buckets={buckets}
                  resolved={resolved}
                  className={cn(!showPasses && 'lg:col-span-2')}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
};

export default ReportsPage;
