import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Car,
  LineChart,
  Moon,
  Plus,
  QrCode,
  Sun,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useGetSessionsQuery } from '@/app/(public)/(pages)/home/_redux/api';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { RevenueTrendChart } from '@/components/dashboard/RevenueTrendChart';
import { MixCard } from '@/components/dashboard/MixCard';
import { DARK_MIX_PALETTE, LIGHT_MIX_PALETTE, type MixSegment } from '@/components/dashboard/mix-types';

type Theme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'parkflow-dashboard-theme';

// Active/primary pill — used consistently across the period toggle, the New
// session CTA, and the chart mode toggle so the "current selection" affordance
// reads as one system.
const ACTIVE_PILL = 'bg-zinc-900 text-white dark:bg-teal-500 dark:text-zinc-950';

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

type Period = 'today' | 'week' | 'month';

const PERIODS: { key: Period; label: string; noun: string }[] = [
  { key: 'today', label: 'Today', noun: 'day' },
  { key: 'week', label: 'This week', noun: 'week' },
  { key: 'month', label: 'This month', noun: 'month' },
];

// `offset` of 0 is the current period, -1 is the immediately preceding one
// (used to compute the "previous week" comparison shown on each stat card).
const getPeriodRange = (period: Period, offset: number): [Date, Date] => {
  const now = new Date();

  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + offset);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return [start, end];
  }

  if (period === 'week') {
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + diffToMonday + offset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return [start, end];
  }

  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return [start, end];
};

const inRange = (iso: string, start: Date, end: Date) => {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
};

// Sunday-start calendar week, independent of the Today/Week/Month tabs above —
// the revenue trend chart always compares "this calendar week vs last calendar week".
const getSundayWeekStart = (offset: number): Date => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - now.getDay() + offset * 7);
  return start;
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  const buckets: [string, number][] = otherTotal > 0 ? [...top, ['Other', otherTotal]] : top;
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
        'inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold',
        isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function StatIcon({ icon: Icon, tone }: { icon: typeof Wallet; tone: 'blue' | 'green' | 'amber' }) {
  const toneClasses = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  }[tone];
  return (
    <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-8 sm:w-8', toneClasses)}>
      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
    </div>
  );
}

const DashboardPage = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('week');

  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(THEME_STORAGE_KEY) as Theme | null) ?? 'light'
  );
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const { data, isLoading, isError } = useGetSessionsQuery(undefined);
  const sessions: ParkingSession[] = data ?? [];
  const loading = isLoading;
  const error = isError ? 'Failed to load dashboard data.' : '';

  const stats = useMemo(() => {
    const [curStart, curEnd] = getPeriodRange(period, 0);
    const [prevStart, prevEnd] = getPeriodRange(period, -1);

    const curSessions = sessions.filter((s) => inRange(s.entry_time, curStart, curEnd));
    const prevSessions = sessions.filter((s) => inRange(s.entry_time, prevStart, prevEnd));

    const currentRevenue = sumCharge(curSessions);
    const previousRevenue = sumCharge(prevSessions);

    const carsParked = curSessions.length;
    const carsParkedPrev = prevSessions.length;

    const elapsedMs = Math.min(Date.now(), curEnd.getTime()) - curStart.getTime();
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
    };
  }, [sessions, period]);

  const periodNoun = PERIODS.find((p) => p.key === period)!.noun;
  const periodLabelLower = PERIODS.find((p) => p.key === period)!.label.toLowerCase();

  const [chartMode, setChartMode] = useState<'bar' | 'line'>('bar');

  const weeklyTrend = useMemo(() => {
    const curStart = getSundayWeekStart(0);
    const prevStart = getSundayWeekStart(-1);
    const current = new Array(7).fill(0);
    const previous = new Array(7).fill(0);

    for (const s of sessions) {
      const charge = Number(s.calculated_charge) || 0;
      if (charge === 0) continue;
      const t = new Date(s.entry_time).getTime();

      const curOffset = Math.floor((t - curStart.getTime()) / 86_400_000);
      if (curOffset >= 0 && curOffset < 7) current[curOffset] += charge;

      const prevOffset = Math.floor((t - prevStart.getTime()) / 86_400_000);
      if (prevOffset >= 0 && prevOffset < 7) previous[prevOffset] += charge;
    }

    return { labels: WEEKDAY_LABELS, current, previous };
  }, [sessions]);

  const mix = useMemo(() => {
    const list = stats.curSessions;
    const palette = theme === 'dark' ? DARK_MIX_PALETTE : LIGHT_MIX_PALETTE;
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
  }, [stats.curSessions, theme]);

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
            <ToggleGroup
              value={[period]}
              onValueChange={(value) => {
                const next = value[0] as Period | undefined;
                if (next) setPeriod(next);
              }}
              className="overflow-x-auto"
            >
              {PERIODS.map((p) => (
                <ToggleGroupItem
                  key={p.key}
                  value={p.key}
                  className={cn(
                    'whitespace-nowrap px-2 py-0.5 text-xs font-medium sm:px-2.5 sm:py-1',
                    'text-muted-foreground hover:text-foreground',
                    'data-[pressed]:bg-primary data-[pressed]:text-white dark:data-[pressed]:bg-teal-500 dark:data-[pressed]:text-zinc-950'
                  )}
                >
                  {p.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button
              size="lg"
              onClick={() => navigate('/')}
              className="w-full justify-center gap-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto "
            >
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
              <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 ">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-4 pb-2 sm:p-6 sm:pb-3">
                    <div className="flex min-w-0 items-center gap-5">
                      <StatIcon icon={Wallet} tone="blue" />
                      <CardTitle className="truncate">Current revenue</CardTitle>
                    </div>
                    {loading ? <Skeleton className="h-4 w-12 shrink-0" /> : <TrendPill value={stats.revenueChange} />}
                  </CardHeader>
                  <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 ">
                    {loading ? (
                      <Skeleton className="h-7 w-28" />
                    ) : (
                      <div className="truncate font-mono text-xl font-bold tracking-tight tabular-nums text-foreground sm:text-2xl">
                        {formatNRs(stats.currentRevenue)}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      Previous {periodNoun}{' '}
                      <span className="font-mono tabular-nums text-foreground/80">{formatNRs(stats.previousRevenue)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-4 pb-2 sm:p-6 sm:pb-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <StatIcon icon={Car} tone="blue" />
                      <CardTitle className="truncate">Cars parked</CardTitle>
                    </div>
                    {loading ? <Skeleton className="h-4 w-12 shrink-0" /> : <TrendPill value={stats.carsChange} />}
                  </CardHeader>
                  <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    {loading ? (
                      <Skeleton className="h-7 w-16" />
                    ) : (
                      <div className="font-mono text-xl font-bold tracking-tight tabular-nums text-foreground sm:text-2xl">
                        {stats.carsParked}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      Previous {periodNoun} <span className="font-mono tabular-nums text-foreground/80">{stats.carsParkedPrev}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-4 pb-2 sm:p-6 sm:pb-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <StatIcon icon={TrendingUp} tone="green" />
                      <CardTitle className="truncate">Predicted revenue</CardTitle>
                    </div>
                    {loading ? <Skeleton className="h-4 w-12 shrink-0" /> : <TrendPill value={stats.predictedChange} />}
                  </CardHeader>
                  <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    {loading ? (
                      <Skeleton className="h-7 w-28" />
                    ) : (
                      <div className="truncate font-mono text-xl font-bold tracking-tight tabular-nums text-foreground sm:text-2xl">
                        {formatNRs(stats.predictedRevenue)}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">End of this {periodNoun}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
                    <div className="flex items-center gap-2.5">
                      <StatIcon icon={QrCode} tone="amber" />
                      <CardTitle>Online / QR</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    {loading ? (
                      <Skeleton className="h-7 w-full" />
                    ) : (
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-base font-bold tabular-nums text-foreground sm:text-lg">
                            {formatNRs(stats.digitalRevenue)}
                          </div>
                          <div className="text-xs text-muted-foreground">this {periodNoun}</div>
                        </div>
                        <Separator orientation="vertical" className="h-9 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-base font-bold tabular-nums text-foreground/70 sm:text-lg">
                            {formatNRs(stats.digitalRevenuePrev)}
                          </div>
                          <div className="text-xs text-muted-foreground">last {periodNoun}</div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="mt-4">
                <CardHeader className="flex flex-col gap-3 p-4 pb-2 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pb-3">
                  <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1">
                    <button
                      type="button"
                      onClick={() => setChartMode('bar')}
                      className={cn(
                        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors sm:px-3 sm:py-1.5',
                        chartMode === 'bar' ? ACTIVE_PILL : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      Bar chart
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartMode('line')}
                      className={cn(
                        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors sm:px-3 sm:py-1.5',
                        chartMode === 'line' ? ACTIVE_PILL : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <LineChart className="h-3.5 w-3.5" />
                      Line chart
                    </button>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-zinc-900 dark:bg-teal-400" /> This week
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-zinc-300 dark:bg-zinc-700" /> Last week
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
                  {loading ? (
                    <Skeleton className="h-[180px] w-full" />
                  ) : (
                    <RevenueTrendChart
                      labels={weeklyTrend.labels}
                      current={weeklyTrend.current}
                      previous={weeklyTrend.previous}
                      mode={chartMode}
                    />
                  )}
                </CardContent>
              </Card>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[260px] w-full rounded-xl" />)
                ) : (
                  <>
                    <MixCard
                      title="Vehicle mix"
                      subtitle={periodLabelLower}
                      segments={mix.vehicle}
                      centerLabel={String(stats.curSessions.length)}
                    />
                    <MixCard title="Payment method" subtitle={periodLabelLower} segments={mix.payment} />
                    <MixCard title="Session status" subtitle={periodLabelLower} segments={mix.status} />
                  </>
                )}
              </div>

              <Card className="mt-4">
                <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
                  <CardTitle className="text-base font-semibold text-foreground">Recent sessions</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  {loading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-9 w-full" />
                      ))}
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
                          {sessions.slice(0, 20).map((s) => (
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