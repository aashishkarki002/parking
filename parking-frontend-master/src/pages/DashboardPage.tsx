'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Plus,
} from 'lucide-react';
import { useGetSessionsQuery } from '@/app/(public)/(pages)/home/_redux/api';
import { AppSidebar } from '@/components/app-sidebar';
import { GlobalSearch } from '@/components/GlobalSearch';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { RevenueMixChart, RevenueMixChartSkeleton } from '@/components/dashboard/RevenueMixChart';
import { MixCard, MixCardSkeleton } from '@/components/dashboard/MixCard';
import { MIX_PALETTE, type MixSegment } from '@/components/dashboard/mix-types';
import { PeriodScopeBar } from '@/components/dashboard/PeriodScopeBar';
import { inRange, planBuckets, resolveScope, type Scope } from '@/components/dashboard/scope';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"


type Theme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'parkflow-dashboard-theme';

interface ParkingSession {
  id: string;
  ticket_number: string;
  license_plate: string;
  vehicle_type: string;
  status: string;
  entry_time: string;
  exit_time: string | null;
  calculated_charge: string | null;
  payment_method: string | null;
}


const SESSIONS_PAGE_SIZE = 10;

const humanizeLabel = (raw: string) =>
  raw
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

// Buckets a list into the top `maxBuckets` most common values of `keyFn`,
// folding the remainder into "Other", and assigns each bucket a palette color.
function buildMixSegments<T>(
  list: T[],
  keyFn: (item: T) => string,
  palette: string[],
  maxBuckets = 3
): MixSegment[] {
  const counts = new Map<string, number>();
  for (const item of list) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, maxBuckets);
  const otherTotal = sorted.slice(maxBuckets).reduce((sum, [, v]) => sum + v, 0);
  const buckets: [string, number][] = otherTotal > 0 ? [...top, ['Covered by pass', otherTotal]] : top;
  const total = list.length;
  return buckets.map(([label, value], i) => ({
    label,
    value,
    pct: total > 0 ? Math.round((value / total) * 100) : 0,
    color: palette[i % palette.length],
  }));
}

const sumCharge = (list: ParkingSession[]) =>
  list.reduce((sum, s) => sum + (Number(s.calculated_charge) || 0), 0);

const isDigitalPayment = (s: ParkingSession) => {
  const method = (s.payment_method || '').toLowerCase();
  return method !== '' && method !== 'cash';
};

const formatNRs = (amount: number) =>
  `NRs ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(amount))}`;

const pctChange = (current: number, previous: number) =>
  previous > 0 ? ((current - previous) / previous) * 100 : null;

function TrendPill({ value }: { value: number | null }) {
  if (value === null) return null;
  const isUp = value >= 0;
  const Icon = isUp ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5  text-[11px] font-semibold tabular-nums',
        isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
      )}
    >
      <Icon className="h-3 w-3" />
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
    <div className="flex flex-col gap-2.5 bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {label}
        </span>
        {loading ? <Skeleton className="h-3.5 w-10 shrink-0" /> : <TrendPill value={delta} />}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-28" />
      ) : (
        <div className="truncate text-[26px] font-bold leading-none tracking-tight tabular-nums text-foreground sm:text-[30px]">
          {value}
        </div>
      )}
      <div className="text-xs text-muted-foreground">{footer}</div>
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

  const { data, isLoading, isError } = useGetSessionsQuery(undefined);
  const sessions: ParkingSession[] = data ?? [];
  const loading = isLoading;
  const error = isError ? 'Failed to load dashboard data.' : '';
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);


  // Everything about "what window am I looking at, and against what" is decided
  // in one place, so the figures, the chart copy and the scope bar can't drift.
  const resolved = useMemo(() => resolveScope(scope), [scope]);
  const buckets = useMemo(() => planBuckets(resolved.start, resolved.end), [resolved]);

  const stats = useMemo(() => {
    const { start: curStart, end: curEnd, cursor, prevStart, prevEnd } = resolved;

    const curSessions = sessions.filter((s) => inRange(s.entry_time, curStart, curEnd));
    // Baseline is truncated to the same elapsed span (see scope.ts) — otherwise
    // a partial month always loses to a whole one and every delta reads red.
    const prevSessions = sessions.filter((s) => inRange(s.entry_time, prevStart, prevEnd));

    const currentRevenue = sumCharge(curSessions);
    const previousRevenue = sumCharge(prevSessions);

    const carsParked = curSessions.length;
    const carsParkedPrev = prevSessions.length;

    const elapsedMs = cursor.getTime() - curStart.getTime();
    const totalMs = curEnd.getTime() - curStart.getTime();
    const elapsedFraction = totalMs > 0 ? Math.min(Math.max(elapsedMs / totalMs, 0.01), 1) : 1;
    const predictedRevenue = currentRevenue / elapsedFraction;

    const digitalRevenue = sumCharge(curSessions.filter(isDigitalPayment));
    const digitalRevenuePrev = sumCharge(prevSessions.filter(isDigitalPayment));

    return {
      curSessions,
      currentRevenue,
      previousRevenue,
      revenueChange: pctChange(currentRevenue, previousRevenue),
      carsParked,
      carsParkedPrev,
      carsChange: pctChange(carsParked, carsParkedPrev),
      predictedRevenue,
      predictedChange: pctChange(predictedRevenue, previousRevenue),
      digitalRevenue,
      digitalRevenuePrev,
      digitalRevenueChange: pctChange(digitalRevenue, digitalRevenuePrev),
    };
  }, [sessions, resolved]);
  const statusOptions = useMemo(() => {
    const set = new Set(sessions.map((s) => s.status));
    return Array.from(set);
  }, [sessions]);


  // Cash vs. digital revenue, bucketed at whatever granularity the resolved
  // window calls for (see planBuckets), plus this window's digital-payment
  // share against the baseline's. The two series stack to each bucket's total,
  // so a stacked bar is meaningful here.
  const revenueMix = useMemo(() => {
    const { labels, indexOf } = buckets;
    const { start: curStart, end: curEnd, prevStart, prevEnd } = resolved;
    const cash = new Array(labels.length).fill(0);
    const digital = new Array(labels.length).fill(0);
    let prevCash = 0;
    let prevDigital = 0;

    for (const s of sessions) {
      const charge = Number(s.calculated_charge) || 0;
      if (charge === 0) continue;
      const entry = new Date(s.entry_time);
      const t = entry.getTime();
      const digitalPayment = isDigitalPayment(s);

      if (t >= curStart.getTime() && t < curEnd.getTime()) {
        const idx = indexOf(entry);
        if (idx >= 0 && idx < labels.length) {
          if (digitalPayment) digital[idx] += charge;
          else cash[idx] += charge;
        }
      }

      if (t >= prevStart.getTime() && t < prevEnd.getTime()) {
        if (digitalPayment) prevDigital += charge;
        else prevCash += charge;
      }
    }

    const data = labels.map((label, i) => ({ label, cash: cash[i], digital: digital[i] }));
    const totalCash = cash.reduce((sum, v) => sum + v, 0);
    const totalDigital = digital.reduce((sum, v) => sum + v, 0);
    const total = totalCash + totalDigital;
    const prevTotal = prevCash + prevDigital;
    const digitalSharePct = total > 0 ? (totalDigital / total) * 100 : 0;
    const prevDigitalSharePct = prevTotal > 0 ? (prevDigital / prevTotal) * 100 : 0;

    return { data, total, digitalSharePct, digitalShareDeltaPts: digitalSharePct - prevDigitalSharePct };
  }, [sessions, resolved, buckets]);

  const mix = useMemo(() => {
    const list = stats.curSessions;
    const palette = MIX_PALETTE;
    return {
      vehicle: buildMixSegments(list, (s) => s.vehicle_type || 'Unknown', palette, 3),
      payment: buildMixSegments(
        list,
        (s) => (!s.payment_method ? 'Unpaid' : isDigitalPayment(s) ? 'Online / QR' : 'Cash'),
        palette,
        4
      ),
      status: buildMixSegments(list, (s) => humanizeLabel(s.status), palette, 4),
    };
  }, [stats.curSessions]);
  const filteredSessions = useMemo(() => {
    if (statusFilter === 'all') return sessions;
    return sessions.filter((s) => s.status === statusFilter);
  }, [sessions, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / SESSIONS_PAGE_SIZE));
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);
  const scopeKey = scope.kind === 'preset' ? scope.key : `${scope.start}_${scope.end}`;

  const getPageNumbers = (current: number, total: number): (number | 'ellipsis')[] => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages: (number | 'ellipsis')[] = [1];
    if (current > 3) pages.push('ellipsis');

    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);

    if (current < total - 2) pages.push('ellipsis');
    pages.push(total);

    return pages;
  };
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className={theme === 'dark' ? 'dark' : undefined}>
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="h-8 w-8 shrink-0 rounded-lg border border-border text-foreground/70 hover:bg-muted hover:text-foreground" />
            <h1 className="text-lg font-semibold text-foreground sm:text-xl">Dashboard</h1>

          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <GlobalSearch />
            <Button
              size="lg"
              onClick={() => navigate('/')}
              className="w-full justify-center gap-1.5   text-primary-foreground hover:bg-primary/90 sm:w-auto "
            >
              <Plus className="h-3.5 w-3.5" />
              New session
            </Button>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-6 sm:py-6 ">
          <div className="mb-4 text-xs text-muted-foreground">
            Live snapshot of permits, occupancy and revenue across{' '}
            <b className="font-semibold text-foreground/90">Sallyan House</b>.
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          ) : (
            <>
              <PeriodScopeBar scope={scope} onScopeChange={setScope} resolved={resolved} />

              {/* Keyed on the scope so a change cross-fades the figures in
                  rather than hard-swapping them under the reader's eye. */}
              <div key={scopeKey} className="scope-fade">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
                <KpiCell
                  label="Revenue"
                  loading={loading}
                  value={formatNRs(stats.currentRevenue)}
                  delta={stats.revenueChange}
                  footer={
                    <>
                      Baseline{' '}
                      <span className="tabular-nums text-foreground/70">{formatNRs(stats.previousRevenue)}</span>
                    </>
                  }
                />
                <KpiCell
                  label="Vehicle parked"
                  loading={loading}
                  value={stats.carsParked}
                  delta={stats.carsChange}
                  footer={
                    <>
                      Baseline{' '}
                      <span className="tabular-nums text-foreground/70">{stats.carsParkedPrev}</span>
                    </>
                  }
                />
                <KpiCell
                  label="Projected"
                  loading={loading}
                  value={formatNRs(stats.predictedRevenue)}
                  delta={stats.predictedChange}
                  footer={
                    <>
                      Baseline{' '}
                      <span className="tabular-nums text-foreground/70">{formatNRs(stats.previousRevenue)}</span>
                    </>
                  }
                />
                <KpiCell
                  label="Online / QR"
                  loading={loading}
                  value={formatNRs(stats.digitalRevenue)}
                  delta={stats.digitalRevenueChange}
                  footer={
                    <>
                      Baseline{' '}
                      <span className="tabular-nums text-foreground/70">{formatNRs(stats.digitalRevenuePrev)}</span>
                    </>
                  }
                />
              </div>

              {loading ? (
                <div className="mt-4">
                  <RevenueMixChartSkeleton bars={buckets.labels.length} />
                </div>
              ) : (
                <div className="mt-4">
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

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                      centerLabel={String(stats.curSessions.length)}
                    />
                    <MixCard title="Payment method" subtitle={resolved.scopeLabel} segments={mix.payment} />
                    <MixCard title="Session status" subtitle={resolved.scopeLabel} segments={mix.status} />
                  </>
                )}
              </div>
              </div>

              <Card className="mt-4">

                <CardHeader className="flex-col items-stretch gap-3 p-4 pb-2 sm:flex-row sm:items-center sm:gap-4 sm:p-6 sm:pb-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base font-semibold text-foreground">Recent sessions</CardTitle>
                    {/* Says so out loud: this list is live and whole, and the
                        range above has no say over it. */}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Every session on record — not limited to the selected range
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-between sm:w-auto sm:shrink-0 sm:justify-center"
                        />
                      }
                    >
                      <span className="min-w-0 truncate">
                        Status: {statusFilter === 'all' ? 'All' : humanizeLabel(statusFilter)}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-auto min-w-44">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setStatusFilter('all')}>
                          All statuses
                        </DropdownMenuItem>
                        {statusOptions.map((status) => (
                          <DropdownMenuItem key={status} onClick={() => setStatusFilter(status)}>
                            {humanizeLabel(status)}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">

                  {loading ? (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground uppercase">
                            <th className="hidden px-2 py-2 sm:table-cell">Ticket</th>
                            <th className="px-2 py-2">Plate</th>
                            <th className="px-2 py-2">Status</th>
                            <th className="hidden px-2 py-2 md:table-cell">Entry Time</th>
                            <th className="px-2 py-2 text-right">Charge</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td className="hidden px-2 py-2.5 sm:table-cell">
                                <Skeleton className="h-3.5 w-16" />
                              </td>
                              <td className="px-2 py-2.5">
                                <Skeleton className="h-3.5 w-20" />
                              </td>
                              <td className="px-2 py-2.5">
                                <Skeleton className="h-3.5 w-24" />
                              </td>
                              <td className="hidden px-2 py-2.5 md:table-cell">
                                <Skeleton className="h-3.5 w-32" />
                              </td>
                              <td className="px-2 py-2.5">
                                <Skeleton className="ml-auto h-3.5 w-14" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground uppercase">
                            <th className="hidden px-2 py-2 sm:table-cell">Ticket</th>
                            <th className="px-2 py-2">Plate</th>
                            <th className="px-2 py-2">Status</th>
                            <th className="hidden px-2 py-2 md:table-cell">Entry Time</th>
                            <th className="px-2 py-2 text-right">Charge</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSessions.slice((page - 1) * SESSIONS_PAGE_SIZE, page * SESSIONS_PAGE_SIZE).map((s) => (
                            <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                              <td className="hidden max-w-[120px] truncate px-2 py-2 font-mono text-xs text-muted-foreground sm:table-cell">
                                {s.ticket_number}
                              </td>
                              <td className="max-w-[100px] truncate px-2 py-2 font-medium">{s.license_plate}</td>
                              <td className="px-2 py-2">{humanizeLabel(s.status)}</td>
                              <td className="hidden whitespace-nowrap px-2 py-2 text-muted-foreground md:table-cell">
                                {new Date(s.entry_time).toLocaleString()}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right font-mono tabular-nums">
                                {s.calculated_charge ?? '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-3 flex flex-col items-center justify-between gap-3 sm:flex-row">
                        <span className="text-sm text-muted-foreground">
                          {filteredSessions.length} sessions
                        </span>

                        {totalPages > 1 && (
                          <Pagination className="mx-0 w-auto justify-end">
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setPage((p) => Math.max(1, p - 1));
                                  }}
                                  className={page <= 1 ? 'pointer-events-none opacity-50' : undefined}
                                />
                              </PaginationItem>

                              {getPageNumbers(page, totalPages).map((p, i) =>
                                p === 'ellipsis' ? (
                                  <PaginationItem key={`ellipsis-${i}`}>
                                    <PaginationEllipsis />
                                  </PaginationItem>
                                ) : (
                                  <PaginationItem key={p}>
                                    <PaginationLink
                                      href="#"
                                      isActive={p === page}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setPage(p);
                                      }}
                                    >
                                      {p}
                                    </PaginationLink>
                                  </PaginationItem>
                                )
                              )}

                              <PaginationItem>
                                <PaginationNext
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setPage((p) => Math.min(totalPages, p + 1));
                                  }}
                                  className={page >= totalPages ? 'pointer-events-none opacity-50' : undefined}
                                />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default DashboardPage;