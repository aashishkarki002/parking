import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Download, Plus, Search, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { TicketIcon } from '@heroicons/react/24/outline';
import {
  useGetSessionsQuery,
  usePaymentMethodMutation,
  usePrintBillMutation,
} from '@/app/(public)/(pages)/home/_redux/api';
import { AddSessionDialog } from '@/components/sessions/AddSessionDialog';
import { vehicleIconFor } from '@/functions/vehicleIcon';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { formatDate, formatTime } from '@/functions/dateFn';

type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'PAID' | 'WAIVED' | 'COVERED_BY_PASS';
type PaymentMethod = 'CASH' | 'ONLINE_PAYMENT';

interface ParkingSession {
  id: string;
  ticket_number: string;
  vehicle_type: string;
  license_plate: string | null;
  registered_staff_member: string | null;
  entry_time: string;
  exit_time: string | null;
  duration_minutes: number | null;
  applied_coupon: string | null;
  applied_pass: string | null;
  calculated_charge: string | null;
  payment_method: PaymentMethod | null;
  status: SessionStatus;
  notes: string;
}

const PAGE_SIZE = 10;

const TABS: Array<{ key: SessionStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'PAID', label: 'Paid' },
  { key: 'WAIVED', label: 'Waived' },
  { key: 'COVERED_BY_PASS', label: 'Covered by pass' },
];

const VEHICLE_FILTER_LABEL = 'All vehicle types';
const PAYMENT_FILTER_LABELS: Record<'ALL' | 'CASH' | 'ONLINE_PAYMENT' | 'UNPAID', string> = {
  ALL: 'All payments',
  CASH: 'Cash',
  ONLINE_PAYMENT: 'Online',
  UNPAID: 'Unpaid',
};
const ENTRY_FILTER_LABELS: Record<'ALL' | 'TODAY', string> = {
  ALL: 'All entry dates',
  TODAY: 'Entered today',
};

const formatAmount = (value: string | number | null) => {
  const n = Number(value ?? 0);
  return `Rs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const formatDuration = (totalMinutes: number) => {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

const paymentLabel = (s: ParkingSession) => {
  if (s.status === 'PAID') return s.payment_method === 'CASH' ? 'Cash' : 'Online';
  if (s.status === 'COVERED_BY_PASS') return 'Monthly pass';
  if (s.status === 'WAIVED') return s.applied_coupon ? `Coupon · ${s.applied_coupon}` : 'Waived';
  if (s.status === 'COMPLETED') return Number(s.calculated_charge || 0) > 0 ? 'Unpaid' : '—';
  return '—';
};

const csvEscape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

const toCsv = (rows: ParkingSession[]) => {
  const headers = ['Ticket', 'Vehicle type', 'Plate', 'Entry time', 'Exit time', 'Duration (min)', 'Status', 'Payment', 'Amount'];
  const lines = rows.map((r) =>
    [
      r.ticket_number,
      r.vehicle_type,
      r.license_plate ?? '',
      r.entry_time,
      r.exit_time ?? '',
      String(r.duration_minutes ?? ''),
      r.status,
      r.payment_method ?? '',
      r.calculated_charge ?? '',
    ]
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

function StatusBadge({ status }: { status: SessionStatus }) {
  const map: Record<SessionStatus, { label: string; cls: string; live?: boolean }> = {
    ACTIVE: { label: 'Active', cls: 'border-primary/25 bg-secondary text-primary', live: true },
    COMPLETED: { label: 'Completed', cls: 'border-border bg-muted text-muted-foreground' },
    PAID: {
      label: 'Paid',
      cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400',
    },
    WAIVED: {
      label: 'Waived',
      cls: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400',
    },
    COVERED_BY_PASS: {
      label: 'Covered by pass',
      cls: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300',
    },
  };
  const cfg = map[status];
  return (
    <Badge variant="outline" className={cn('gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', cfg.cls)}>
      <span className={cn('h-1.5 w-1.5 rounded-full bg-current', cfg.live && 'animate-pulse')} />
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
  tone?: 'danger';
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-card p-4">
      <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'text-[26px] leading-none font-bold tracking-tight tabular-nums',
          tone === 'danger' ? 'text-destructive' : 'text-foreground'
        )}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{caption}</span>
    </div>
  );
}

const SessionsPage = () => {
  const { data, isLoading, isError } = useGetSessionsQuery(undefined);
  const sessions: ParkingSession[] = data ?? [];

  const [closeSession] = usePrintBillMutation();
  const [markPaid] = usePaymentMethodMutation();

  const [tab, setTab] = useState<SessionStatus | 'ALL'>('ALL');
  const [vehicleFilter, setVehicleFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'CASH' | 'ONLINE_PAYMENT' | 'UNPAID'>('ALL');
  const [entryFilter, setEntryFilter] = useState<'ALL' | 'TODAY'>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [actioning, setActioning] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => dayjs());

  // Keeps live "Active" durations ticking without refetching the list.
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 30_000);
    return () => clearInterval(id);
  }, []);

  const vehicleTypeOptions = useMemo(
    () => Array.from(new Set(sessions.map((s) => s.vehicle_type).filter(Boolean))).sort(),
    [sessions]
  );

  const stats = useMemo(() => {
    const active = sessions.filter((s) => s.status === 'ACTIVE');
    const longest = active.reduce(
      (acc, s) => {
        const mins = now.diff(dayjs(s.entry_time), 'minute');
        return mins > acc.mins ? { mins, vehicle: s.vehicle_type } : acc;
      },
      { mins: -1, vehicle: '' }
    );

    const closedToday = sessions.filter(
      (s) => s.status !== 'ACTIVE' && s.exit_time && dayjs(s.exit_time).isSame(now, 'day')
    );
    const avgStay = closedToday.length
      ? closedToday.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0) / closedToday.length
      : 0;

    const paidToday = sessions.filter((s) => s.status === 'PAID' && s.exit_time && dayjs(s.exit_time).isSame(now, 'day'));
    const cashToday = paidToday
      .filter((s) => s.payment_method === 'CASH')
      .reduce((sum, s) => sum + Number(s.calculated_charge || 0), 0);
    const onlineToday = paidToday
      .filter((s) => s.payment_method === 'ONLINE_PAYMENT')
      .reduce((sum, s) => sum + Number(s.calculated_charge || 0), 0);

    const unsettled = sessions.filter((s) => s.status === 'COMPLETED' && Number(s.calculated_charge || 0) > 0);
    const unsettledTotal = unsettled.reduce((sum, s) => sum + Number(s.calculated_charge || 0), 0);

    return {
      activeCount: active.length,
      longestMins: longest.mins > 0 ? longest.mins : 0,
      longestVehicle: longest.vehicle,
      closedTodayCount: closedToday.length,
      avgStay,
      cashToday,
      onlineToday,
      collectedToday: cashToday + onlineToday,
      unsettledCount: unsettled.length,
      unsettledTotal,
    };
  }, [sessions, now]);

  const tabCounts = useMemo(() => {
    const counts: Record<SessionStatus | 'ALL', number> = {
      ALL: sessions.length,
      ACTIVE: 0,
      COMPLETED: 0,
      PAID: 0,
      WAIVED: 0,
      COVERED_BY_PASS: 0,
    };
    sessions.forEach((s) => {
      counts[s.status] += 1;
    });
    return counts;
  }, [sessions]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (tab !== 'ALL' && s.status !== tab) return false;
      if (vehicleFilter !== 'ALL' && s.vehicle_type !== vehicleFilter) return false;
      if (paymentFilter === 'CASH' && s.payment_method !== 'CASH') return false;
      if (paymentFilter === 'ONLINE_PAYMENT' && s.payment_method !== 'ONLINE_PAYMENT') return false;
      if (paymentFilter === 'UNPAID' && !(s.status === 'COMPLETED' && Number(s.calculated_charge || 0) > 0)) return false;
      if (entryFilter === 'TODAY' && !dayjs(s.entry_time).isSame(now, 'day')) return false;
      if (term) {
        const haystack = `${s.ticket_number} ${s.license_plate ?? ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [sessions, tab, vehicleFilter, paymentFilter, entryFilter, search, now]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);
  const pageAllSelected = pageRows.length > 0 && pageRows.every((s) => selected.has(s.ticket_number));

  const handleTabChange = (key: SessionStatus | 'ALL') => {
    setTab(key);
    setPage(0);
  };
  const handleVehicleChange = (value: string) => {
    setVehicleFilter(value);
    setPage(0);
  };
  const handlePaymentChange = (value: 'ALL' | 'CASH' | 'ONLINE_PAYMENT' | 'UNPAID') => {
    setPaymentFilter(value);
    setPage(0);
  };
  const handleEntryChange = (value: 'ALL' | 'TODAY') => {
    setEntryFilter(value);
    setPage(0);
  };
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const togglePageAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) {
        pageRows.forEach((s) => next.delete(s.ticket_number));
      } else {
        pageRows.forEach((s) => next.add(s.ticket_number));
      }
      return next;
    });
  };
  const toggleRow = (ticket: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ticket)) next.delete(ticket);
      else next.add(ticket);
      return next;
    });
  };

  const withActioning = async (ticket: string, fn: () => Promise<void>) => {
    setActioning((prev) => new Set(prev).add(ticket));
    try {
      await fn();
    } finally {
      setActioning((prev) => {
        const next = new Set(prev);
        next.delete(ticket);
        return next;
      });
    }
  };

  const handleCloseSession = (ticket: string) =>
    withActioning(ticket, async () => {
      try {
        await closeSession({ ticketNo: ticket }).unwrap();
        toast.success(`Ticket ${ticket} closed.`);
      } catch {
        toast.error(`Could not close ticket ${ticket}.`);
      }
    });

  const handleMarkPaid = (ticket: string, method: PaymentMethod) =>
    withActioning(ticket, async () => {
      try {
        await markPaid({ ticketNo: ticket, payment_method: method }).unwrap();
        toast.success(`Ticket ${ticket} marked paid.`);
      } catch {
        toast.error(`Could not mark ticket ${ticket} as paid.`);
      }
    });

  const handleBulkForceExit = async () => {
    const targets = sessions.filter((s) => selected.has(s.ticket_number) && s.status === 'ACTIVE');
    if (targets.length === 0) {
      toast.info('No active sessions selected.');
      return;
    }
    const results = await Promise.allSettled(targets.map((s) => closeSession({ ticketNo: s.ticket_number }).unwrap()));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    if (ok === targets.length) toast.success(`Closed ${ok} session${ok === 1 ? '' : 's'}.`);
    else toast.warning(`Closed ${ok} of ${targets.length} selected sessions.`);
    setSelected(new Set());
  };

  const handleBulkMarkPaid = async () => {
    const targets = sessions.filter(
      (s) => selected.has(s.ticket_number) && s.status === 'COMPLETED' && Number(s.calculated_charge || 0) > 0
    );
    if (targets.length === 0) {
      toast.info('No unpaid completed sessions selected.');
      return;
    }
    const results = await Promise.allSettled(
      targets.map((s) => markPaid({ ticketNo: s.ticket_number, payment_method: 'CASH' }).unwrap())
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    if (ok === targets.length) toast.success(`Marked ${ok} session${ok === 1 ? '' : 's'} paid (cash).`);
    else toast.warning(`Marked ${ok} of ${targets.length} selected sessions paid.`);
    setSelected(new Set());
  };

  const handleExport = (rows: ParkingSession[]) => {
    if (rows.length === 0) {
      toast.info('Nothing to export.');
      return;
    }
    downloadCsv(`parking-sessions-${dayjs().format('YYYYMMDD-HHmm')}.csv`, toCsv(rows));
  };

  return (
    <PageShell
      title="Parking sessions"
      actions={
        <>
          <Button variant="outline" onClick={() => handleExport(filtered)}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add parking session
          </Button>
        </>
      }
    >
      <AddSessionDialog open={addOpen} onOpenChange={setAddOpen} />

      {isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          Failed to load parking sessions.
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
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={TicketIcon}
          title="No parking sessions yet"
          description="Tickets opened at the gate will show up here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
            <KpiTile
              label="Active now"
              value={stats.activeCount}
              caption={
                stats.longestVehicle
                  ? `Longest running ${formatDuration(stats.longestMins)} · ${stats.longestVehicle}`
                  : 'No active sessions'
              }
            />
            <KpiTile
              label="Closed today"
              value={stats.closedTodayCount}
              caption={stats.closedTodayCount > 0 ? `Avg stay ${formatDuration(stats.avgStay)}` : 'Nothing closed yet today'}
            />
            <KpiTile
              label="Collected today"
              value={formatAmount(stats.collectedToday)}
              caption={`Cash ${formatAmount(stats.cashToday)} · Online ${formatAmount(stats.onlineToday)}`}
            />
            <KpiTile
              label={<span className="text-destructive">Unsettled</span>}
              value={<span className="text-destructive">{formatAmount(stats.unsettledTotal)}</span>}
              caption={`${stats.unsettledCount} completed session${stats.unsettledCount === 1 ? '' : 's'} awaiting payment`}
            />
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border px-2 pt-1">
              <Tabs value={tab} onValueChange={(value) => handleTabChange(value as SessionStatus | 'ALL')}>
                <TabsList variant="line" className="h-auto bg-transparent p-0">
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
                  placeholder="Search ticket or plate…"
                  className="pl-8"
                />
              </div>
              <Select value={vehicleFilter} onValueChange={(value) => handleVehicleChange(value as string)}>
                <SelectTrigger size="sm">
                  <SelectValue>{(value: string) => (value === 'ALL' ? VEHICLE_FILTER_LABEL : value)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{VEHICLE_FILTER_LABEL}</SelectItem>
                  {vehicleTypeOptions.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={paymentFilter} onValueChange={(value) => handlePaymentChange(value as typeof paymentFilter)}>
                <SelectTrigger size="sm">
                  <SelectValue>{(value: keyof typeof PAYMENT_FILTER_LABELS) => PAYMENT_FILTER_LABELS[value]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_FILTER_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={entryFilter} onValueChange={(value) => handleEntryChange(value as typeof entryFilter)}>
                <SelectTrigger size="sm">
                  <SelectValue>{(value: keyof typeof ENTRY_FILTER_LABELS) => ENTRY_FILTER_LABELS[value]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ENTRY_FILTER_LABELS).map(([value, label]) => (
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
                  <Button size="xs" variant="outline" onClick={handleBulkMarkPaid}>
                    Mark paid (cash)
                  </Button>
                  <Button size="xs" variant="outline" onClick={handleBulkForceExit}>
                    Force exit
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => handleExport(sessions.filter((s) => selected.has(s.ticket_number)))}>
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
                      indeterminate={!pageAllSelected && pageRows.some((s) => selected.has(s.ticket_number))}
                      onCheckedChange={() => togglePageAll()}
                      aria-label="Select all sessions on this page"
                    />
                  </TableHead>
                  <TableHead className="px-3 py-2.5">Ticket</TableHead>
                  <TableHead className="px-3 py-2.5">Vehicle</TableHead>
                  <TableHead className="px-3 py-2.5">Entry time</TableHead>
                  <TableHead className="px-3 py-2.5">Exit time</TableHead>
                  <TableHead className="px-3 py-2.5">Duration</TableHead>
                  <TableHead className="px-3 py-2.5">Status</TableHead>
                  <TableHead className="px-3 py-2.5">Payment</TableHead>
                  <TableHead className="px-3 py-2.5 text-right">Amount</TableHead>
                  <TableHead className="w-24 px-3 py-2.5 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={10} className="px-3 py-10 text-center text-sm text-muted-foreground">
                      No sessions match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((s, i) => {
                    const VehicleIcon = vehicleIconFor(s.vehicle_type);
                    const minutes = s.exit_time
                      ? (s.duration_minutes ?? dayjs(s.exit_time).diff(dayjs(s.entry_time), 'minute'))
                      : now.diff(dayjs(s.entry_time), 'minute');
                    const amountOwed = s.status === 'COMPLETED' && Number(s.calculated_charge || 0) > 0;
                    const isBusy = actioning.has(s.ticket_number);

                    return (
                      <TableRow
                        key={s.id}
                        className={cn(
                          selected.has(s.ticket_number) && 'bg-accent/40 hover:bg-accent/40',
                          i % 2 === 1 && !selected.has(s.ticket_number) && 'bg-muted/20'
                        )}
                      >
                        <TableCell className="px-3 py-2.5">
                          <Checkbox
                            checked={selected.has(s.ticket_number)}
                            onCheckedChange={() => toggleRow(s.ticket_number)}
                            aria-label={`Select ticket ${s.ticket_number}`}
                          />
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          <span className="font-mono text-[12.5px] font-semibold text-primary">{s.ticket_number}</span>
                          {s.registered_staff_member && (
                            <span className="mt-0.5 block text-[10.5px] text-muted-foreground">{s.registered_staff_member}</span>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                              <VehicleIcon className="h-3.5 w-3.5" />
                            </span>
                            <div className="flex flex-col">
                              <span className="text-[12.5px] font-semibold text-foreground">{s.vehicle_type}</span>
                              <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
                                {s.license_plate || '—'}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          <div className="flex flex-col">
                            <span className="font-mono text-[13px] tabular-nums text-foreground">{formatTime(s.entry_time)}</span>
                            <span className="text-[10.5px] text-muted-foreground">{formatDate(s.entry_time)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          {s.exit_time ? (
                            <div className="flex flex-col">
                              <span className="font-mono text-[13px] tabular-nums text-foreground">{formatTime(s.exit_time)}</span>
                              <span className="text-[10.5px] text-muted-foreground">{formatDate(s.exit_time)}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 font-mono text-[12px] font-semibold tabular-nums',
                              s.status === 'ACTIVE' ? 'text-primary' : 'text-foreground'
                            )}
                          >
                            {s.status === 'ACTIVE' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
                            {formatDuration(minutes)}
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          <StatusBadge status={s.status} />
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          <span className={cn('text-[12px] font-medium', amountOwed ? 'text-destructive' : 'text-foreground')}>
                            {paymentLabel(s)}
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-right">
                          <span
                            className={cn(
                              'font-mono text-[12.5px] font-bold tabular-nums',
                              amountOwed
                                ? 'text-destructive'
                                : s.calculated_charge == null || Number(s.calculated_charge) === 0
                                  ? 'font-medium text-muted-foreground'
                                  : 'text-foreground'
                            )}
                          >
                            {s.calculated_charge != null ? formatAmount(s.calculated_charge) : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-right">
                          {s.status === 'ACTIVE' && (
                            <Button size="xs" variant="outline" disabled={isBusy} onClick={() => handleCloseSession(s.ticket_number)}>
                              Close
                            </Button>
                          )}
                          {amountOwed && (
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                disabled={isBusy}
                                className={buttonVariants({ variant: 'outline', size: 'xs' })}
                              >
                                Mark paid
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => handleMarkPaid(s.ticket_number, 'CASH')}>Cash</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleMarkPaid(s.ticket_number, 'ONLINE_PAYMENT')}>
                                  Online
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          {s.status !== 'ACTIVE' && !amountOwed && <span className="text-muted-foreground">—</span>}
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
                {Math.min(filtered.length, clampedPage * PAGE_SIZE + PAGE_SIZE)} of {filtered.length} sessions
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
        </div>
      )}
    </PageShell>
  );
};

export default SessionsPage;
