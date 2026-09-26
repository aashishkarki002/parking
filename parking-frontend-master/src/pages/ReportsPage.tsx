import { useMemo, useState, type ReactNode } from 'react';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PeriodScopeBar } from '@/components/dashboard/PeriodScopeBar';
import { inRange, resolveScope, type Scope } from '@/components/dashboard/scope';
import { RevenueHeadline } from '@/components/reports/RevenueHeadline';
import { LossBreakdown } from '@/components/reports/LossBreakdown';
import { PassEconomics } from '@/components/reports/PassEconomics';
import { TrafficSection } from '@/components/reports/TrafficSection';
import { TenantValidationTable } from '@/components/reports/TenantValidationTable';
import {
  computeMetrics,
  formatMinutes,
  formatMoney,
  type ReportSession,
} from '@/components/reports/metrics';
import { passFeesInWindow, type PassRow } from '@/components/reports/passes';
import {
  useGetParkingPassesQuery,
  useGetSessionsQuery,
} from '@/app/(public)/(pages)/home/_redux/api';
import { useGetConfigurationQuery } from '@/app/(public)/(pages)/settings/_redux/api';

const NONE: never[] = [];

// One section, one question. The title is the question answered; the line under
// it is the caveat a reader needs before trusting the numbers — never a second
// helping of figures, which is what buried the old layout.
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle className="text-[15px] font-semibold text-foreground">{title}</CardTitle>
        <CardDescription className="text-[12.5px] leading-snug">{hint}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
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
 * Every figure is derived client-side from /parking/sessions — there is no
 * reporting endpoint — so the whole page is one query plus `computeMetrics`.
 * Sessions are scoped by entry time, and each figure is compared against the
 * same elapsed span in the previous period (see scope.ts).
 */
const ReportsPage = () => {
  const { data: sessionsData, isLoading, isError } = useGetSessionsQuery(undefined);
  const { data: passesData } = useGetParkingPassesQuery(undefined);
  const { data: configData } = useGetConfigurationQuery(undefined);

  // An auto_closed session's exit_time is a staff correction, not a real
  // exit, so it must never feed a duration/usage/revenue figure.
  const sessions: ReportSession[] = useMemo(
    () => ((sessionsData ?? NONE) as ReportSession[]).filter((s) => !s.auto_closed),
    [sessionsData]
  );
  const currency: string = configData?.currency_symbol ?? 'NRs';

  const [scope, setScope] = useState<Scope>({ kind: 'preset', key: 'month' });
  // Sampled once per mount so the window cannot shift mid-render.
  const [now] = useState(() => new Date());
  const resolved = useMemo(() => resolveScope(scope, now), [scope, now]);

  const scoped = useMemo(
    () => sessions.filter((s) => inRange(s.entry_time, resolved.start, resolved.end)),
    [sessions, resolved]
  );
  const current = useMemo(() => computeMetrics(scoped), [scoped]);
  // Pass fees belong to a term, not to a day, so they are apportioned to the
  // window rather than filtered into it (see passes.ts).
  const passFees = useMemo(
    () => passFeesInWindow(passesData as PassRow[] | undefined, resolved.start, resolved.end),
    [passesData, resolved]
  );
  const previous = useMemo(
    () =>
      computeMetrics(sessions.filter((s) => inRange(s.entry_time, resolved.prevStart, resolved.prevEnd))),
    [sessions, resolved]
  );

  const empty = !isLoading && !isError && current.sessions === 0;

  return (
    <PageShell title="Reports">
      <div className="flex flex-col gap-4">
        <PeriodScopeBar scope={scope} onScopeChange={setScope} resolved={resolved} />

        {isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            Failed to load session data.
          </div>
        ) : isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-56 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : empty ? (
          <EmptyState
            icon={ChartBarIcon}
            title="No sessions in this period"
            description="Pick a wider range, or come back once vehicles have entered."
          />
        ) : (
          <>
            <RevenueHeadline
              current={current}
              previous={previous}
              currency={currency}
              passFees={passFees}
              scopeLabel={resolved.scopeLabel}
              comparisonLabel={resolved.comparisonLabel}
            />

            <Section
              title={
                current.leakage > 0
                  ? `Why ${formatMoney(current.leakage, currency)} was given away`
                  : 'Revenue given away'
              }
              hint="Ranked by amount, monthly passes excluded — those were paid for. Each session counts once, against its main cause; free-minute sources interact, so this is not a linear split."
            >
              <LossBreakdown causes={current.leakCauses} currency={currency} />
            </Section>

            {(current.passValue > 0 || passFees.passes > 0) && (
              <Section
                title="Monthly passes"
                hint={`What pass holders' parking was worth at gate rates ${resolved.scopeLabel}, against the fees that covered it.`}
              >
                <PassEconomics
                  current={current}
                  passFees={passFees}
                  currency={currency}
                  scopeLabel={resolved.scopeLabel}
                />
              </Section>
            )}

            <Section
              title="Tenant validation"
              hint={
                current.sessionsValidated > 0 ? (
                  <>
                    {current.tenants.length} {current.tenants.length === 1 ? 'tenant' : 'tenants'}{' '}
                    stamped {current.sessionsValidated}{' '}
                    {current.sessionsValidated === 1 ? 'ticket' : 'tickets'}, giving away{' '}
                    {formatMinutes(current.freeMinutesGranted)} of parking. Anything beyond what the
                    stamps covered is billed to the tenant, never to the visitor.
                  </>
                ) : (
                  'Tenants stamp a visitor’s ticket to cover their parking. Nothing was stamped in this period.'
                )
              }
            >
              <TenantValidationTable tenants={current.tenants} currency={currency} />
            </Section>

            <TrafficSection sessions={scoped} resolved={resolved} />
          </>
        )}
      </div>
    </PageShell>
  );
};

export default ReportsPage;
