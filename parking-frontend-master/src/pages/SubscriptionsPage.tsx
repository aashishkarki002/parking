import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { Clock10Icon, Download, Plus, RefreshCcw, Search, TriangleAlert, X } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  useGetParkingPassesQuery,
  useGetSessionsQuery,
  useGetStaffQuery,
  useUpdateParkingPassMutation,
} from '@/app/(public)/(pages)/home/_redux/api';
import { AddSubscriptionDialog } from '@/components/subscriptions/AddSubscriptionDialog';
import { vehicleIconFor } from '@/functions/vehicleIcon';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { cn } from '@/lib/utils';
import { formatDate } from '@/functions/dateFn';

type PassStatus = 'ACTIVE' | 'DUE_SOON' | 'LAPSED' | 'INACTIVE';
const DUE_SOON_DAYS = 14;
const STANDARD_MONTHLY_RATE = 5000;

interface PassStaff {
  id: number;
  name: string;
  license_plate: string;
  vehicle_type: string | null;
  company: string | null;
}

interface ParkingPassRow {
  id: number;
  staff: PassStaff;
  valid_from: string;
  valid_until: string;
  price_paid: string;
  is_active: boolean;
  notes: string;
}

interface StaffMember {
  id: number;
  name: string;
  license_plate: string;
  vehicle_type: string | null;
}

interface ParkingSessionRow {
  registered_staff_member: string | null;
  entry_time: string;
  status: string;
  calculated_charge: string | null;
}

const PAGE_SIZE = 8;

const TABS: Array<{ key: PassStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'DUE_SOON', label: 'Due soon' },
  { key: 'LAPSED', label: 'Lapsed' },
  { key: 'INACTIVE', label: 'Inactive' },
];

const TERM_FILTER_LABELS: Record<'ALL' | '1' | '3' | '6' | 'OTHER', string> = {
  ALL: 'All terms',
  '1': '1 month',
  '3': '3 months',
  '6': '6 months',
  OTHER: 'Custom / pro-rated',
};

const WINDOW_FILTER_LABELS: Record<'ALL' | '30' | '90', string> = {
  ALL: 'All valid-until dates',
  '30': 'Next 30 days',
  '90': 'Next 90 days',
};

const formatAmount = (value: string | number | null) => {
  const n = Number(value ?? 0);
  return `Rs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const statusOf = (p: ParkingPassRow, now: dayjs.Dayjs): PassStatus => {
  if (!p.is_active) return 'INACTIVE';
  const until = dayjs(p.valid_until);
  if (until.isBefore(now)) return 'LAPSED';
  if (until.diff(now, 'day') <= DUE_SOON_DAYS) return 'DUE_SOON';
  return 'ACTIVE';
};

const termMonthsOf = (p: ParkingPassRow) => {
  const days = dayjs(p.valid_until).diff(dayjs(p.valid_from), 'day');
  return Math.max(1, Math.round(days / 30));
};

const termBucketOf = (p: ParkingPassRow): '1' | '3' | '6' | 'OTHER' => {
  const days = dayjs(p.valid_until).diff(dayjs(p.valid_from), 'day');
  if (Math.abs(days - 30) <= 3) return '1';
  if (Math.abs(days - 91) <= 4) return '3';
  if (Math.abs(days - 182) <= 5) return '6';
  return 'OTHER';
};

const staffCode = (id: number) => `STAFF-${String(id).padStart(3, '0')}`;

const csvEscape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

const toCsv = (rows: ParkingPassRow[]) => {
  const headers = ['Staff', 'Plate', 'Vehicle', 'Valid from', 'Valid until', 'Price paid', 'Active'];
  const lines = rows.map((r) =>
    [r.staff.name, r.staff.license_plate, r.staff.vehicle_type ?? '', r.valid_from, r.valid_until, r.price_paid, String(r.is_active)]
      .map((v) => csvEscape(String(v)))
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
};

const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

function StatusBadge({ status }: { status: PassStatus }) {
  const map: Record<PassStatus, { label: string; cls: string }> = {
    ACTIVE: {
      label: 'Active',
      cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400',
    },
    DUE_SOON: {
      label: 'Due soon',
      cls: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400',
    },
    LAPSED: {
      label: 'Lapsed',
      cls: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400',
    },
    INACTIVE: { label: 'Inactive', cls: 'border-border bg-muted text-muted-foreground' },
  };
  const cfg = map[status];
  return (
    <Badge variant="outline" className={cn('gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', cfg.cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {cfg.label}
    </Badge>
  );
}

function KpiTile({
  label,
  value,
  caption,
  tone,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  caption: React.ReactNode;
  tone?: 'danger' | 'warning';
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-card p-4">
      <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'text-[26px] leading-none font-bold tracking-tight tabular-nums',
          tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
        )}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{caption}</span>
    </div>
  );
}

const SubscriptionsPage = () => {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useGetParkingPassesQuery(undefined);
  const passes: ParkingPassRow[] = data ?? [];

  const { data: staffData } = useGetStaffQuery(undefined);
  const staff: StaffMember[] = staffData ?? [];

  const { data: sessionsData } = useGetSessionsQuery(undefined);
  const sessions: ParkingSessionRow[] = sessionsData ?? [];

  const [updatePass] = useUpdateParkingPassMutation();

  const [tab, setTab] = useState<PassStatus | 'ALL'>('ALL');
  const [termFilter, setTermFilter] = useState<'ALL' | '1' | '3' | '6' | 'OTHER'>('ALL');
  const [windowFilter, setWindowFilter] = useState<'ALL' | '30' | '90'>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [actioning, setActioning] = useState<Set<number>>(new Set());

  const now = dayjs();

  const rows = useMemo(
    () => passes.map((p) => ({ pass: p, status: statusOf(p, now) })),
    [passes, now]
  );

  const tabCounts = useMemo(() => {
    const counts: Record<PassStatus | 'ALL', number> = { ALL: rows.length, ACTIVE: 0, DUE_SOON: 0, LAPSED: 0, INACTIVE: 0 };
    rows.forEach(({ status }) => {
      counts[status] += 1;
    });
    return counts;
  }, [rows]);

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.status === 'ACTIVE' || r.status === 'DUE_SOON');
    const monthlyRecurring = active.reduce((sum, r) => sum + Number(r.pass.price_paid) / termMonthsOf(r.pass), 0);
    const dueSoon = rows.filter((r) => r.status === 'DUE_SOON');
    const dueSoonWorth = dueSoon.reduce((sum, r) => sum + Number(r.pass.price_paid), 0);
    const lapsed = rows.filter((r) => r.status === 'LAPSED').sort((a, b) => dayjs(b.pass.valid_until).diff(dayjs(a.pass.valid_until)));

    return {
      activeCount: active.length,
      monthlyRecurring,
      dueSoonCount: dueSoon.length,
      dueSoonWorth,
      lapsedCount: lapsed.length,
      mostRecentLapsed: lapsed[0] ?? null,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(({ pass, status }) => {
      if (tab !== 'ALL' && status !== tab) return false;
      if (termFilter !== 'ALL' && termBucketOf(pass) !== termFilter) return false;
      if (windowFilter !== 'ALL') {
        const days = dayjs(pass.valid_until).diff(now, 'day');
        if (days > Number(windowFilter)) return false;
      }
      if (term) {
        const haystack = `${pass.staff.name} ${pass.staff.license_plate} ${staffCode(pass.staff.id)}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [rows, tab, termFilter, windowFilter, search, now]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);
  const pageAllSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.pass.id));

  const eligibleStaffIds = useMemo(() => {
    const covered = new Set(rows.filter((r) => r.status === 'ACTIVE' || r.status === 'DUE_SOON').map((r) => r.pass.staff.id));
    return new Set(staff.filter((s) => !covered.has(s.id)).map((s) => s.id));
  }, [rows, staff]);

  const needsAttention = useMemo(() => {
    return rows
      .filter((r) => r.status === 'LAPSED')
      .map(({ pass }) => {
        const key = `${pass.staff.name} - ${pass.staff.license_plate}`;
        const sessionsSince = sessions.filter(
          (s) => s.registered_staff_member === key && dayjs(s.entry_time).isAfter(dayjs(pass.valid_until))
        );
        const unbilled = sessionsSince
          .filter((s) => s.status === 'COMPLETED')
          .reduce((sum, s) => sum + Number(s.calculated_charge || 0), 0);
        return { pass, sessionsCount: sessionsSince.length, unbilled };
      })
      .filter((x) => x.sessionsCount > 0)
      .slice(0, 3);
  }, [rows, sessions]);

  const renewalCalendar = useMemo(
    () =>
      rows
        .filter((r) => r.status === 'ACTIVE' || r.status === 'DUE_SOON')
        .sort((a, b) => dayjs(a.pass.valid_until).diff(dayjs(b.pass.valid_until)))
        .slice(0, 5),
    [rows]
  );

  const dueSoonNames = useMemo(() => rows.filter((r) => r.status === 'DUE_SOON'), [rows]);

  const handleTabChange = (key: PassStatus | 'ALL') => {
    setTab(key);
    setPage(0);
  };
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
  };
  const handleTermChange = (value: typeof termFilter) => {
    setTermFilter(value);
    setPage(0);
  };
  const handleWindowChange = (value: typeof windowFilter) => {
    setWindowFilter(value);
    setPage(0);
  };

  const togglePageAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) pageRows.forEach((r) => next.delete(r.pass.id));
      else pageRows.forEach((r) => next.add(r.pass.id));
      return next;
    });
  };
  const toggleRow = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const withActioning = async (id: number, fn: () => Promise<void>) => {
    setActioning((prev) => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setActioning((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleRenew = (pass: ParkingPassRow) =>
    withActioning(pass.id, async () => {
      const base = dayjs(pass.valid_until).isAfter(now) ? dayjs(pass.valid_until) : now;
      try {
        await updatePass({
          id: pass.id,
          valid_until: base.add(1, 'month').toISOString(),
          price_paid: Number(pass.price_paid) + STANDARD_MONTHLY_RATE,
          is_active: true,
        }).unwrap();
        toast.success(`${pass.staff.name}'s pass renewed 1 month.`);
      } catch {
        toast.error(`Could not renew ${pass.staff.name}'s pass.`);
      }
    });

  const handleToggleActive = (pass: ParkingPassRow) =>
    withActioning(pass.id, async () => {
      try {
        await updatePass({ id: pass.id, is_active: !pass.is_active }).unwrap();
        toast.success(`${pass.staff.name}'s pass ${pass.is_active ? 'deactivated' : 'reactivated'}.`);
      } catch {
        toast.error(`Could not update ${pass.staff.name}'s pass.`);
      }
    });

  const handleBulkRenew = async () => {
    const targets = passes.filter((p) => selected.has(p.id));
    if (targets.length === 0) {
      toast.info('No passes selected.');
      return;
    }
    const results = await Promise.allSettled(
      targets.map((p) => {
        const base = dayjs(p.valid_until).isAfter(now) ? dayjs(p.valid_until) : now;
        return updatePass({
          id: p.id,
          valid_until: base.add(1, 'month').toISOString(),
          price_paid: Number(p.price_paid) + STANDARD_MONTHLY_RATE,
          is_active: true,
        }).unwrap();
      })
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    if (ok === targets.length) toast.success(`Renewed ${ok} pass${ok === 1 ? '' : 'es'}.`);
    else toast.warning(`Renewed ${ok} of ${targets.length} selected passes.`);
    setSelected(new Set());
  };

  const handleBulkDeactivate = async () => {
    const targets = passes.filter((p) => selected.has(p.id) && p.is_active);
    if (targets.length === 0) {
      toast.info('No active passes selected.');
      return;
    }
    const results = await Promise.allSettled(targets.map((p) => updatePass({ id: p.id, is_active: false }).unwrap()));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    if (ok === targets.length) toast.success(`Deactivated ${ok} pass${ok === 1 ? '' : 'es'}.`);
    else toast.warning(`Deactivated ${ok} of ${targets.length} selected passes.`);
    setSelected(new Set());
  };

  const handleExport = (targetRows: ParkingPassRow[]) => {
    if (targetRows.length === 0) {
      toast.info('Nothing to export.');
      return;
    }
    downloadCsv(`subscription-passes-${dayjs().format('YYYYMMDD-HHmm')}.csv`, toCsv(targetRows));
  };

  return (
    <PageShell
      title="Subscription passes"
      actions={
        <>
          <Button variant="outline" onClick={() => handleExport(filtered.map((r) => r.pass))}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add subscription pass
          </Button>
        </>
      }
    >
      <AddSubscriptionDialog open={addOpen} onOpenChange={setAddOpen} staffOptions={staff} eligibleStaffIds={eligibleStaffIds} />

      {isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          Failed to load subscription passes.
        </div>
      ) : isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card p-4">
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ) : passes.length === 0 ? (
        <EmptyState
          icon={Clock10Icon}
          title="No subscription passes yet"
          description="Monthly parking passes issued to staff will show up here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
            <KpiTile
              label="Active passes"
              value={stats.activeCount}
              caption={`${stats.lapsedCount} lapsed · ${stats.activeCount} vehicles covered`}
            />
            <KpiTile
              label="Monthly recurring"
              value={formatAmount(stats.monthlyRecurring)}
              caption={`${stats.activeCount} active pass${stats.activeCount === 1 ? '' : 'es'}`}
            />
            <KpiTile
              label="Renewals due in 14 days"
              value={stats.dueSoonCount}
              caption={`Worth ${formatAmount(stats.dueSoonWorth)}`}
              tone="warning"
            />
            <KpiTile
              label="Lapsed"
              value={stats.lapsedCount}
              caption={
                stats.mostRecentLapsed
                  ? `${stats.mostRecentLapsed.pass.staff.name} · ended ${now.diff(dayjs(stats.mostRecentLapsed.pass.valid_until), 'day')}d ago`
                  : 'None lapsed'
              }
              tone="danger"
            />
          </div>

          <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[1fr_300px] xl:items-start">
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="border-b border-border px-2 pt-1">
                <Tabs value={tab} onValueChange={(value) => handleTabChange(value as PassStatus | 'ALL')}>
                  <TabsList variant="line" className="h-auto flex-wrap bg-transparent p-0">
                    {TABS.map((t) => (
                      <TabsTrigger
                        key={t.key}
                        value={t.key}
                        className="h-auto gap-1.5 rounded-none px-3 pt-1.5 pb-2.5 text-[12.5px] font-semibold data-active:bg-transparent"
                      >
                        {t.label}
                        <Badge
                          variant="secondary"
                          className={cn(
                            'rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                            tab === t.key ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {tabCounts[t.key]}
                        </Badge>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              <div className="flex flex-col gap-2.5 border-b border-border bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Search staff, ID or plate…"
                    className="pl-8"
                  />
                </div>
                <Select value={termFilter} onValueChange={(value) => handleTermChange(value as typeof termFilter)}>
                  <SelectTrigger size="sm">
                    <SelectValue>{(value: keyof typeof TERM_FILTER_LABELS) => TERM_FILTER_LABELS[value]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TERM_FILTER_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={windowFilter} onValueChange={(value) => handleWindowChange(value as typeof windowFilter)}>
                  <SelectTrigger size="sm">
                    <SelectValue>{(value: keyof typeof WINDOW_FILTER_LABELS) => WINDOW_FILTER_LABELS[value]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(WINDOW_FILTER_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selected.size > 0 && (
                <div className="flex items-center gap-3 border-b border-border bg-accent px-3 py-2">
                  <span className="text-[12.5px] font-semibold text-accent-foreground">
                    {selected.size} of {filtered.length} selected
                  </span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button size="xs" onClick={handleBulkRenew}>
                      <RefreshCcw className="h-3.5 w-3.5" />
                      Renew selected
                    </Button>
                    <Button size="xs" variant="outline" onClick={handleBulkDeactivate}>
                      Deactivate
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => handleExport(passes.filter((p) => selected.has(p.id)))}
                    >
                      Export selection
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>
                      <X className="h-3.5 w-3.5" />
                      Clear
                    </Button>
                  </div>
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 text-xs font-medium text-muted-foreground uppercase hover:bg-muted/40">
                    <TableHead className="w-9 px-3 py-2.5">
                      <Checkbox
                        checked={pageAllSelected}
                        indeterminate={!pageAllSelected && pageRows.some((r) => selected.has(r.pass.id))}
                        onCheckedChange={() => togglePageAll()}
                        aria-label="Select all passes on this page"
                      />
                    </TableHead>
                    <TableHead className="px-3 py-2.5">Staff</TableHead>
                    <TableHead className="px-3 py-2.5">Vehicle</TableHead>
                    <TableHead className="px-3 py-2.5">Pass period</TableHead>
                    <TableHead className="px-3 py-2.5 text-right">Price paid</TableHead>
                    <TableHead className="px-3 py-2.5">Status</TableHead>
                    <TableHead className="w-28 px-3 py-2.5 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        No subscription passes match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map(({ pass, status }, i) => {
                      const VehicleIcon = vehicleIconFor(pass.staff.vehicle_type || '');
                      const daysLeft = dayjs(pass.valid_until).diff(now, 'day');
                      const totalDays = Math.max(1, dayjs(pass.valid_until).diff(dayjs(pass.valid_from), 'day'));
                      const elapsedDays = Math.min(totalDays, Math.max(0, now.diff(dayjs(pass.valid_from), 'day')));
                      const remainingPct = Math.max(0, Math.min(100, 100 - (elapsedDays / totalDays) * 100));
                      const isBusy = actioning.has(pass.id);

                      return (
                        <TableRow
                          key={pass.id}
                          className={cn(
                            selected.has(pass.id) && 'bg-accent/40 hover:bg-accent/40',
                            i % 2 === 1 && !selected.has(pass.id) && 'bg-muted/20'
                          )}
                        >
                          <TableCell className="px-3 py-2.5">
                            <Checkbox
                              checked={selected.has(pass.id)}
                              onCheckedChange={() => toggleRow(pass.id)}
                              aria-label={`Select pass for ${pass.staff.name}`}
                            />
                          </TableCell>
                          <TableCell className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-[11px] font-bold text-accent-foreground">
                                {pass.staff.name
                                  .split(' ')
                                  .filter(Boolean)
                                  .map((p) => p[0])
                                  .slice(0, 2)
                                  .join('')
                                  .toUpperCase()}
                              </span>
                              <div className="flex flex-col">
                                <span className="text-[12.5px] font-semibold text-foreground">{pass.staff.name}</span>
                                <span className="font-mono text-[10.5px] tracking-tight text-muted-foreground">
                                  {staffCode(pass.staff.id)}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-[11px] font-semibold text-foreground">
                              <VehicleIcon className="h-3 w-3 text-muted-foreground" />
                              {pass.staff.license_plate}
                            </span>
                          </TableCell>
                          <TableCell className="px-3 py-2.5">
                            <div className="flex min-w-[150px] flex-col gap-1">
                              <span className="flex items-baseline justify-between gap-2 font-mono text-[11px] text-muted-foreground">
                                <span>
                                  {formatDate(pass.valid_from, 'DD MMM')} → {formatDate(pass.valid_until, 'DD MMM')}
                                </span>
                                <b className="font-sans text-[11px] font-semibold text-foreground">
                                  {daysLeft >= 0 ? `${daysLeft}d left` : `Ended ${Math.abs(daysLeft)}d ago`}
                                </b>
                              </span>
                              <span className="h-[5px] overflow-hidden rounded-full bg-muted">
                                <span
                                  className={cn(
                                    'block h-full rounded-full',
                                    status === 'LAPSED' || status === 'INACTIVE'
                                      ? 'bg-destructive'
                                      : status === 'DUE_SOON'
                                        ? 'bg-amber-500'
                                        : 'bg-primary'
                                  )}
                                  style={{ width: `${status === 'LAPSED' ? 100 : remainingPct === 0 ? 100 : 100 - remainingPct}%` }}
                                />
                              </span>
                              <span className="text-[10px] text-muted-foreground">{termMonthsOf(pass)}-month term</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-right">
                            <span className="font-mono text-[12.5px] font-bold tabular-nums text-foreground">
                              {formatAmount(pass.price_paid)}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-muted-foreground">
                              {formatAmount(Number(pass.price_paid) / termMonthsOf(pass))} / mo
                            </span>
                          </TableCell>
                          <TableCell className="px-3 py-2.5">
                            <StatusBadge status={status} />
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {(status === 'DUE_SOON' || status === 'LAPSED') && (
                                <Button size="xs" variant="outline" disabled={isBusy} onClick={() => handleRenew(pass)}>
                                  Renew
                                </Button>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  disabled={isBusy}
                                  aria-label={`More actions for ${pass.staff.name}`}
                                  className={cn(
                                    'inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50'
                                  )}
                                >
                                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                                    <circle cx="12" cy="5" r="1.6" />
                                    <circle cx="12" cy="12" r="1.6" />
                                    <circle cx="12" cy="19" r="1.6" />
                                  </svg>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  {status !== 'DUE_SOON' && status !== 'LAPSED' && (
                                    <DropdownMenuItem onClick={() => handleRenew(pass)}>Renew +1 month</DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => handleToggleActive(pass)}>
                                    {pass.is_active ? 'Deactivate' : 'Reactivate'}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between border-t border-border bg-muted/20 px-3 py-2.5 text-xs font-medium text-muted-foreground">
                <span>
                  Showing {filtered.length === 0 ? 0 : clampedPage * PAGE_SIZE + 1}–
                  {Math.min(filtered.length, clampedPage * PAGE_SIZE + PAGE_SIZE)} of {filtered.length} subscription passes
                </span>
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        text=""
                        href="#"
                        aria-disabled={clampedPage === 0}
                        className={cn('h-7 w-7 p-0', clampedPage === 0 && 'pointer-events-none opacity-40')}
                        onClick={(e) => {
                          e.preventDefault();
                          setPage((p) => Math.max(0, p - 1));
                        }}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#" isActive size="sm" className="pointer-events-none tabular-nums">
                        {clampedPage + 1} / {pageCount}
                      </PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        text=""
                        href="#"
                        aria-disabled={clampedPage >= pageCount - 1}
                        className={cn('h-7 w-7 p-0', clampedPage >= pageCount - 1 && 'pointer-events-none opacity-40')}
                        onClick={(e) => {
                          e.preventDefault();
                          setPage((p) => Math.min(pageCount - 1, p + 1));
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </div>

            <div className="flex flex-col gap-3.5">
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-3">
                  <h3 className="text-[13px] font-bold text-foreground">Renewal calendar</h3>
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 font-mono text-[10px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
                    {stats.dueSoonCount} in {DUE_SOON_DAYS}d
                  </Badge>
                </div>
                {renewalCalendar.length === 0 ? (
                  <div className="px-3.5 py-6 text-center text-xs text-muted-foreground">No upcoming renewals.</div>
                ) : (
                  <div className="flex flex-col">
                    {renewalCalendar.map(({ pass, status }) => (
                      <div key={pass.id} className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5 last:border-0">
                        <span
                          className={cn(
                            'flex w-9 shrink-0 flex-col items-center rounded-lg py-1',
                            status === 'DUE_SOON' ? 'bg-amber-50 dark:bg-amber-950/40' : 'bg-muted/60'
                          )}
                        >
                          <span
                            className={cn(
                              'font-mono text-[13px] font-bold',
                              status === 'DUE_SOON' ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'
                            )}
                          >
                            {formatDate(pass.valid_until, 'DD')}
                          </span>
                          <span className="text-[8.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                            {formatDate(pass.valid_until, 'MMM')}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-semibold text-foreground">{pass.staff.name}</span>
                          <span className="block text-[10.5px] text-muted-foreground">{staffCode(pass.staff.id)}</span>
                        </span>
                        <span className="font-mono text-[11.5px] font-bold text-foreground">{formatAmount(pass.price_paid)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-3">
                  <h3 className="text-[13px] font-bold text-foreground">Renewal reminders</h3>
                  <span className="text-[10.5px] font-semibold text-muted-foreground">Manual send</span>
                </div>
                <div className="flex flex-col gap-3 px-3.5 py-3.5">
                  {dueSoonNames.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Nobody is due for renewal right now.</span>
                  ) : (
                    <>
                      <span className="text-[12px] font-medium text-foreground">
                        {dueSoonNames.length} staff due within {DUE_SOON_DAYS} days
                        <span className="mt-0.5 block text-[10.5px] font-normal text-muted-foreground">
                          {dueSoonNames.map((r) => r.pass.staff.name).join(' · ')}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        onClick={() => toast.info('Reminder sending is not wired up to SMS/email yet — call or message staff directly for now.')}
                      >
                        Send {dueSoonNames.length} reminder{dueSoonNames.length === 1 ? '' : 's'}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {needsAttention.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="border-b border-border px-3.5 py-3">
                    <h3 className="text-[13px] font-bold text-foreground">Needs attention</h3>
                  </div>
                  <div className="flex flex-col gap-3 px-3.5 py-3.5">
                    {needsAttention.map(({ pass, sessionsCount, unbilled }) => (
                      <div key={pass.id} className="flex items-start gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                          <TriangleAlert className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-semibold text-foreground">
                            {pass.staff.name} parked since their pass lapsed
                          </span>
                          <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                            {sessionsCount} session{sessionsCount === 1 ? '' : 's'} since {formatDate(pass.valid_until)}
                            {unbilled > 0 && ` · ${formatAmount(unbilled)} unbilled`}
                          </span>
                        </span>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => navigate('/sessions')}>
                      Review in sessions
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
};

export default SubscriptionsPage;
