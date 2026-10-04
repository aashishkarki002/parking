import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowUpRight, Check, ChevronDown, Download, Plus, Search, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { TicketIcon } from '@heroicons/react/24/outline';
import {
  useGetSessionsOverviewQuery,
  useGetSessionsTableQuery,
  useLazyGetSessionsTableQuery,
  usePaymentMethodMutation,
  usePrintBillMutation,
  type SessionsTableArgs,
} from '@/app/(public)/(pages)/home/_redux/api';
import { AddSessionDialog } from '@/components/sessions/AddSessionDialog';
import { vehicleIconFor } from '@/functions/vehicleIcon';
import { PageShell } from '@/components/PageShell';
import {
  OVERSTAY_MINUTES,
  formatAmount,
  formatDuration,
  paymentLabel,
  type ParkingSession,
  type PaymentMethod,
  type SessionStatus,
} from '@/components/sessions/session';
import { Plate, StatusLabel } from '@/components/sessions/SessionBits';
import { EmptyState } from '@/components/EmptyState';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { LucideIcon } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Pager } from '@/components/Pager';
import { MixCard, MixCardSkeleton } from '@/components/dashboard/MixCard';
import { MIX_PALETTE, type MixSegment } from '@/components/dashboard/mix-types';
import { TodayOccupancyChart } from '@/components/sessions/TodayOccupancyChart';
import { cn } from '@/lib/utils';
import { formatDate, formatTime } from '@/functions/dateFn';

const PAGE_SIZE = 10;

const TABS: Array<{ key: SessionStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'PAID', label: 'Paid' },
  { key: 'WAIVED', label: 'Waived' },
  { key: 'COVERED_BY_PASS', label: 'Pass' },
];

const PAYMENT_OPTIONS: Array<{ value: 'CASH' | 'ONLINE_PAYMENT' | 'UNPAID'; label: string }> = [
  { value: 'CASH', label: 'Cash' },
  { value: 'ONLINE_PAYMENT', label: 'Online' },
  { value: 'UNPAID', label: 'Unpaid' },
];

// Filters read as chips: an idle one names what it filters, a set one fills in
// and shows the value, so the row itself says what the table is narrowed to.
const FILTER_CHIP =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] whitespace-nowrap outline-none select-none transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-ring';
const FILTER_CHIP_OFF = 'border-border bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground';
const FILTER_CHIP_ON = 'border-transparent bg-muted font-medium text-foreground';

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Select value={value} onValueChange={(v) => onChange((v as string) ?? 'ALL')}>
      <SelectTrigger
        size="default"
        aria-label={`Filter by ${label.toLowerCase()}`}
        className={cn(
          FILTER_CHIP,
          'pr-2 [&>svg]:size-3.5',
          current ? `${FILTER_CHIP_ON} dark:bg-muted` : `${FILTER_CHIP_OFF} dark:bg-transparent`
        )}
      >
        <SelectValue>
          {() =>
            current ? (
              <>
                <span className="font-normal text-muted-foreground">{label}</span>
                {current.label}
              </>
            ) : (
              label
            )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false} className="min-w-44">
        <SelectItem value="ALL">Any {label.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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

const splitAmount = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

const TH = 'h-8 px-3 text-xs font-medium text-muted-foreground';

interface RowView {
  VehicleIcon: LucideIcon;
  minutes: number;
  charge: number | null;
  live: boolean;
  overstay: boolean;
  autoClosed: boolean;
  amountOwed: boolean;
  isBusy: boolean;
  isSelected: boolean;
  payment: string;
  day: string;
}

function TimeRange({ s, day }: { s: ParkingSession; day: string }) {
  return (
    <>
      <span className="block truncate text-[13px] tabular-nums text-foreground">
        {formatTime(s.entry_time, 'HH:mm')}
        <span className="mx-1 text-muted-foreground/70">→</span>
        {s.exit_time ? formatTime(s.exit_time, 'HH:mm') : <span className="text-muted-foreground">now</span>}
      </span>
      <span className="block truncate text-xs text-muted-foreground">{day}</span>
    </>
  );
}

function DurationCell({ v }: { v: RowView }) {
  if (v.autoClosed) {
    return (
      <>
        <span className="block text-[13px] text-muted-foreground">—</span>
        <span className="block text-xs text-muted-foreground">Auto-closed</span>
      </>
    );
  }
  return (
    <>
      <span
        className={cn(
          'block text-[13px] tabular-nums',
          v.overstay ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-foreground'
        )}
      >
        {formatDuration(v.minutes)}
      </span>
      {v.live && (
        <span className={cn('block text-xs', v.overstay ? 'text-amber-600/80 dark:text-amber-400/80' : 'text-muted-foreground')}>
          {v.overstay ? 'Check exit' : 'Parked'}
        </span>
      )}
    </>
  );
}

function AmountCell({ v }: { v: RowView }) {
  return (
    <>
      <span
        className={cn(
          'block text-[13px] tabular-nums',
          v.amountOwed ? 'font-medium text-destructive' : v.charge ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {v.charge != null ? formatAmount(v.charge) : '—'}
      </span>
      {v.payment !== '—' && (
        <span className={cn('block truncate text-xs', v.amountOwed ? 'text-destructive/80' : 'text-muted-foreground')}>
          {v.payment}
        </span>
      )}
    </>
  );
}

// Tiles that map to a filter are buttons: tapping one narrows the table to
// exactly what the number counts, and the tile stays lit while that view is on.
function KpiTile({
  label,
  value,
  unit,
  caption,
  tone,
  footer,
  selected,
  onSelect,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: string;
  caption: React.ReactNode;
  tone?: 'danger';
  footer?: React.ReactNode;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
        {label}
        {onSelect && (
          <ArrowUpRight
            aria-hidden
            className={cn(
              'h-3.5 w-3.5 shrink-0 transition-[opacity,transform] duration-200 ease-out',
              selected
                ? 'text-foreground opacity-100'
                : 'opacity-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100 group-focus-visible:opacity-100'
            )}
          />
        )}
      </span>
      <span
        className={cn(
          'flex items-baseline gap-1 truncate text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums',
          tone === 'danger' ? 'text-destructive' : 'text-foreground'
        )}
      >
        {unit && <span className="text-sm font-medium tracking-normal text-muted-foreground">{unit}</span>}
        {value}
      </span>
      {footer}
      <span className="truncate text-xs text-muted-foreground">{caption}</span>
    </>
  );

  const base = 'flex min-w-0 flex-col gap-2.5 bg-card p-4 text-left sm:p-5';
  if (!onSelect) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        base,
        'group relative outline-none select-none transition-[background-color] duration-150 ease-out hover:bg-muted/40 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted/60',
        selected && 'bg-muted/50 hover:bg-muted/50'
      )}
    >
      {body}
      {selected && <span aria-hidden className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-foreground sm:inset-x-5" />}
    </button>
  );
}

// Thin two-part meter: cash on the left, online on the right, 2px apart.
function SplitBar({ a, b }: { a: number; b: number }) {
  const total = a + b;
  const pct = total > 0 ? (a / total) * 100 : 0;
  return (
    <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
      {total > 0 && (
        <>
          {a > 0 && (
            <span
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%`, backgroundColor: 'var(--chart-2)' }}
            />
          )}
          {b > 0 && <span className="h-full flex-1 rounded-full" style={{ backgroundColor: 'var(--chart-1)' }} />}
        </>
      )}
    </div>
  );
}

// Typing in the search box shouldn't fire a request per keystroke.
const SEARCH_DEBOUNCE_MS = 250;

const SessionsPage = () => {
  const [closeSession] = usePrintBillMutation();
  const [markPaid] = usePaymentMethodMutation();

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<SessionStatus | 'ALL'>(() => {
    const fromUrl = searchParams.get('tab');
    return TABS.some((t) => t.key === fromUrl) ? (fromUrl as SessionStatus | 'ALL') : 'ALL';
  });
  const [vehicleFilter, setVehicleFilter] = useState(() => searchParams.get('vehicle') ?? 'ALL');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'CASH' | 'ONLINE_PAYMENT' | 'UNPAID'>(() => {
    const fromUrl = searchParams.get('payment');
    return fromUrl === 'CASH' || fromUrl === 'ONLINE_PAYMENT' || fromUrl === 'UNPAID' ? fromUrl : 'ALL';
  });
  const [entryFilter, setEntryFilter] = useState<'ALL' | 'TODAY'>(() => (searchParams.get('today') === '1' ? 'TODAY' : 'ALL'));
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [page, setPage] = useState(() => Math.max(0, Number(searchParams.get('page') ?? 1) - 1) || 0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [actioning, setActioning] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => dayjs());

  // Keeps live "Active" durations ticking without refetching the list.
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Re-sync when the sidebar navigates here with a different ?tab=/?payment=
  // while the page is already mounted (query-only navigation doesn't remount).
  useEffect(() => {
    const fromUrl = searchParams.get('tab');
    const next = TABS.some((t) => t.key === fromUrl) ? (fromUrl as SessionStatus | 'ALL') : 'ALL';
    setTab((current) => (current === next ? current : next));
  }, [searchParams]);

  // ?search= comes from the global search palette; only overwrite the box
  // when the URL actually carries a term so sidebar links keep what's typed.
  useEffect(() => {
    const fromUrl = searchParams.get('search');
    if (fromUrl !== null) setSearch(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    const fromUrl = searchParams.get('payment');
    const next = fromUrl === 'CASH' || fromUrl === 'ONLINE_PAYMENT' || fromUrl === 'UNPAID' ? fromUrl : 'ALL';
    setPaymentFilter((current) => (current === next ? current : next));
  }, [searchParams]);

  // Counted server-side: the KPI strip, tab counts and today's chart. Keyed by
  // the local day so the 30s clock tick doesn't refetch it.
  const dayStart = now.startOf('day').toISOString();
  const { data: overview, isError: overviewError } = useGetSessionsOverviewQuery({ day_start: dayStart });

  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  // Everything the table is narrowed to, as the server's filter params.
  const filterArgs = useMemo<SessionsTableArgs>(() => {
    const args: SessionsTableArgs = {};
    if (tab !== 'ALL') args.status = tab;
    if (vehicleFilter !== 'ALL') args.vehicle_type = vehicleFilter;
    if (paymentFilter !== 'ALL') args.payment = paymentFilter;
    if (entryFilter === 'TODAY') {
      args.entry_after = dayStart;
      args.entry_before = dayjs(dayStart).add(1, 'day').toISOString();
    }
    if (debouncedSearch) args.search = debouncedSearch;
    return args;
  }, [tab, vehicleFilter, paymentFilter, entryFilter, debouncedSearch, dayStart]);

  // One page of rows, filtered and paged server-side.
  const {
    data: table,
    isFetching: tableFetching,
    isError: tableError,
  } = useGetSessionsTableQuery({ ...filterArgs, page: page + 1, page_size: PAGE_SIZE });
  const [fetchAllRows, { isFetching: exporting }] = useLazyGetSessionsTableQuery();

  const isError = overviewError || tableError;
  const isLoading = !overview || !table;

  const vehicleTypeOptions = overview?.vehicleTypes ?? [];
  const stats = overview?.stats ?? {
    activeCount: 0,
    longestMins: 0,
    longestVehicle: '',
    overstayCount: 0,
    closedTodayCount: 0,
    avgStay: 0,
    hasTimedExits: false,
    autoClosedToday: 0,
    cashToday: 0,
    onlineToday: 0,
    collectedToday: 0,
    unsettledCount: 0,
    unsettledTotal: 0,
  };

  const tabCounts = useMemo(() => {
    const counts: Record<SessionStatus | 'ALL', number> = {
      ALL: 0,
      ACTIVE: 0,
      COMPLETED: 0,
      PAID: 0,
      WAIVED: 0,
      COVERED_BY_PASS: 0,
    };
    for (const key of Object.keys(counts) as Array<SessionStatus | 'ALL'>) {
      counts[key] = overview?.tabCounts[key] ?? 0;
    }
    return counts;
  }, [overview]);

  // What's physically in the lot right now, by vehicle type: top three, rest as "Other".
  const parkedMix = useMemo<MixSegment[]>(() => {
    const sorted = overview?.parkedMix ?? [];
    const top = sorted.slice(0, 3);
    const rest = sorted.slice(3).reduce((sum, [, n]) => sum + n, 0);
    const buckets: Array<[string, number]> = rest > 0 ? [...top, ['Other', rest]] : top;
    const total = sorted.reduce((sum, [, n]) => sum + n, 0);
    return buckets.map(([label, value], i) => ({
      label,
      value,
      pct: total > 0 ? Math.round((value / total) * 100) : 0,
      color: MIX_PALETTE[i],
    }));
  }, [overview]);

  const total = table?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(() => (table?.results ?? []) as ParkingSession[], [table]);
  const pageAllSelected = pageRows.length > 0 && pageRows.every((s) => selected.has(s.ticket_number));

  // Selection spans pages, but only the visible page is loaded — remember every
  // row seen so bulk actions and "export selected" still know what was ticked.
  const seenRows = useRef(new Map<string, ParkingSession>());
  useEffect(() => {
    pageRows.forEach((s) => seenRows.current.set(s.ticket_number, s));
  }, [pageRows]);
  const selectedRows = () =>
    Array.from(selected)
      .map((ticket) => seenRows.current.get(ticket))
      .filter((s): s is ParkingSession => Boolean(s));

  // A filter change can shrink the result below the current page.
  useEffect(() => {
    if (page > clampedPage) setPage(clampedPage);
  }, [page, clampedPage]);

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
    const targets = selectedRows().filter((s) => s.status === 'ACTIVE');
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
    const targets = selectedRows().filter(
      (s) => s.status === 'COMPLETED' && Number(s.calculated_charge || 0) > 0
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

  // Every row matching the filters, not just the visible page.
  const handleExportFiltered = async () => {
    try {
      const res = await fetchAllRows({ ...filterArgs, page: 1, page_size: Math.max(total, 1), export: 1 }).unwrap();
      handleExport(res.results as ParkingSession[]);
    } catch {
      toast.error('Could not export sessions.');
    }
  };

  const hasFilters = vehicleFilter !== 'ALL' || paymentFilter !== 'ALL' || entryFilter !== 'ALL' || search.trim() !== '';
  const clearFilters = () => {
    setVehicleFilter('ALL');
    setPaymentFilter('ALL');
    setEntryFilter('ALL');
    setSearch('');
    setPage(0);
  };

  // The list's current view as a URL, handed to the session page so its back
  // link returns to the same tab, filters and page instead of a fresh list.
  const listHref = (() => {
    const q = new URLSearchParams();
    if (tab !== 'ALL') q.set('tab', tab);
    if (paymentFilter !== 'ALL') q.set('payment', paymentFilter);
    if (vehicleFilter !== 'ALL') q.set('vehicle', vehicleFilter);
    if (entryFilter === 'TODAY') q.set('today', '1');
    if (search.trim()) q.set('search', search.trim());
    if (clampedPage > 0) q.set('page', String(clampedPage + 1));
    const qs = q.toString();
    return qs ? `/sessions?${qs}` : '/sessions';
  })();
  const sessionHref = (ticket: string) => `/sessions/${encodeURIComponent(ticket)}`;

  // The plate is the real link (keyboard, ⌘-click, copy link); the rest of the
  // row is a convenience target. Clicks that land on a control in the row —
  // or bubble up through a portalled menu — are left to that control.
  const openFromRow = (e: React.MouseEvent<HTMLElement>, ticket: string) => {
    const target = e.target as HTMLElement;
    if (!e.currentTarget.contains(target)) return;
    if (target.closest('a, button, input, label, [role="checkbox"], [role="menuitem"]')) return;
    if (window.getSelection()?.toString()) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(sessionHref(ticket), '_blank', 'noopener');
      return;
    }
    navigate(sessionHref(ticket), { state: { from: listHref } });
  };

  const sessionLink = (ticket: string, children: React.ReactNode) => (
    <Link
      to={sessionHref(ticket)}
      state={{ from: listHref }}
      aria-label={`Open ticket ${ticket}`}
      className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  );

  const showStatus = tab === 'ALL';
  const bodyKey = `${tab}|${vehicleFilter}|${paymentFilter}|${entryFilter}|${clampedPage}`;

  const rowView = (s: ParkingSession): RowView => {
    const minutes = s.exit_time
      ? (s.duration_minutes ?? dayjs(s.exit_time).diff(dayjs(s.entry_time), 'minute'))
      : now.diff(dayjs(s.entry_time), 'minute');
    const charge = s.calculated_charge == null ? null : Number(s.calculated_charge);
    const entry = dayjs(s.entry_time);
    return {
      VehicleIcon: vehicleIconFor(s.vehicle_type),
      minutes,
      charge,
      live: s.status === 'ACTIVE',
      overstay: s.status === 'ACTIVE' && minutes >= OVERSTAY_MINUTES,
      autoClosed: !!s.auto_closed,
      amountOwed: s.status === 'COMPLETED' && (charge ?? 0) > 0,
      isBusy: actioning.has(s.ticket_number),
      isSelected: selected.has(s.ticket_number),
      payment: paymentLabel(s),
      day: entry.isSame(now, 'day')
        ? 'Today'
        : entry.isSame(now.subtract(1, 'day'), 'day')
          ? 'Yesterday'
          : formatDate(s.entry_time, 'D MMM'),
    };
  };

  // A render function, not a component: the 30s clock re-renders the page, and a
  // component defined here would remount and snap an open menu shut.
  const renderActions = (s: ParkingSession, v: RowView) => {
    if (v.live) {
      return (
        <Button size="xs" variant="outline" disabled={v.isBusy} onClick={() => handleCloseSession(s.ticket_number)}>
          Close
        </Button>
      );
    }
    if (v.amountOwed) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger disabled={v.isBusy} className={buttonVariants({ variant: 'default', size: 'xs' })}>
            Collect
            <ChevronDown className="h-3 w-3 opacity-70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => handleMarkPaid(s.ticket_number, 'CASH')}>Paid in cash</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleMarkPaid(s.ticket_number, 'ONLINE_PAYMENT')}>Paid online</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    return null;
  };

  return (
    <PageShell
      title="Parking sessions"
      actions={
        <>
          <Button variant="outline" onClick={handleExportFiltered} disabled={exporting}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New session
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
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2 bg-card p-4 sm:p-5">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:col-span-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-[148px] w-full rounded-lg" />
            </div>
            <MixCardSkeleton legendRows={3} />
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex gap-2 p-4">
              <Skeleton className="h-8 w-80 rounded-lg" />
              <Skeleton className="ml-auto h-8 w-56 rounded-lg" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-t border-border/60 px-4 py-3">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="ml-auto h-3.5 w-16" />
              </div>
            ))}
          </div>
        </div>
      ) : tabCounts.ALL === 0 ? (
        <EmptyState
          icon={TicketIcon}
          title="No parking sessions yet"
          description="Tickets opened at the gate will show up here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
            <KpiTile
              label="Active now"
              value={stats.activeCount.toLocaleString('en-IN')}
              selected={tab === 'ACTIVE'}
              onSelect={() => {
                handlePaymentChange('ALL');
                handleTabChange(tab === 'ACTIVE' ? 'ALL' : 'ACTIVE');
              }}
              caption={
                stats.overstayCount > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    {stats.overstayCount} parked over {OVERSTAY_MINUTES / 60}h · longest {formatDuration(stats.longestMins)}
                  </span>
                ) : stats.longestVehicle ? (
                  `Longest ${formatDuration(stats.longestMins)} · ${stats.longestVehicle}`
                ) : (
                  'Lot is empty'
                )
              }
            />
            <KpiTile
              label="Closed today"
              value={stats.closedTodayCount.toLocaleString('en-IN')}
              caption={
                stats.closedTodayCount === 0
                  ? 'Nothing closed yet'
                  : [
                      stats.hasTimedExits ? `Avg stay ${formatDuration(stats.avgStay)}` : null,
                      stats.autoClosedToday > 0 ? `${stats.autoClosedToday} auto-closed` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
              }
            />
            <KpiTile
              label="Collected today"
              unit="NRs"
              value={splitAmount(stats.collectedToday)}
              footer={<SplitBar a={stats.cashToday} b={stats.onlineToday} />}
              caption={
                <span className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--chart-2)' }} />
                    Cash {splitAmount(stats.cashToday)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--chart-1)' }} />
                    Online {splitAmount(stats.onlineToday)}
                  </span>
                </span>
              }
            />
            <KpiTile
              label="Unsettled"
              unit="NRs"
              tone={stats.unsettledTotal > 0 ? 'danger' : undefined}
              value={splitAmount(stats.unsettledTotal)}
              selected={paymentFilter === 'UNPAID'}
              onSelect={() => {
                const on = paymentFilter === 'UNPAID';
                handleTabChange(on ? 'ALL' : 'COMPLETED');
                handlePaymentChange(on ? 'ALL' : 'UNPAID');
              }}
              caption={
                stats.unsettledCount > 0
                  ? `${stats.unsettledCount} session${stats.unsettledCount === 1 ? '' : 's'} awaiting payment`
                  : 'All settled'
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <TodayOccupancyChart sessions={overview?.todaySpans ?? []} now={now} />
            </div>
            <MixCard
              title="Parked now"
              subtitle="By vehicle type"
              segments={parkedMix}
              centerCaption="parked"
              emptyText="No vehicles on site"
            />
          </div>

          {/* While the next page or filter loads, the old rows stay up, dimmed. */}
          <section
            aria-busy={tableFetching}
            className={cn(
              '@container overflow-hidden rounded-xl border border-border bg-card',
              '[&_table]:transition-opacity [&_table]:duration-150 [&_ul]:transition-opacity [&_ul]:duration-150',
              tableFetching && '[&_table]:opacity-60 [&_ul]:opacity-60'
            )}
          >
            {/* Row 1 — which sessions (status) and finding one (search). */}
            <div className="flex flex-col gap-3 px-4 pt-4 pb-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
              <div
                role="radiogroup"
                aria-label="Filter by status"
                className="flex max-w-full min-w-0 gap-0.5 self-start overflow-x-auto rounded-lg bg-muted p-0.5 [scrollbar-width:none]"
              >
                {TABS.map((t) => {
                  const selectedTab = tab === t.key;
                  const n = tabCounts[t.key];
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="radio"
                      aria-checked={selectedTab}
                      onClick={() => handleTabChange(t.key)}
                      className={cn(
                        'flex h-7 shrink-0 select-none items-center gap-1.5 rounded-md px-3 text-[13px] font-medium',
                        'transition-[color,background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100',
                        'outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selectedTab
                          ? 'bg-background text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_0.5px_rgb(0_0_0/0.06)] dark:bg-zinc-700/80'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {t.label}
                      {n > 0 && (
                        <span
                          className={cn(
                            'text-xs font-normal tabular-nums',
                            selectedTab ? 'text-muted-foreground' : 'text-muted-foreground/70'
                          )}
                        >
                          {n.toLocaleString('en-IN')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full lg:w-64 lg:shrink-0">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && search) {
                      e.preventDefault();
                      handleSearchChange('');
                    }
                  }}
                  placeholder="Search ticket or plate"
                  aria-label="Search sessions by ticket or plate"
                  className="h-8 rounded-lg border-transparent bg-muted pr-8 pl-8 shadow-none focus-visible:border-ring focus-visible:bg-background dark:bg-muted"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => handleSearchChange('')}
                    className="absolute top-1/2 right-1.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-background hover:text-foreground active:scale-[0.9]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Row 2 — refinements, and how many rows they leave. */}
            <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
              <FilterSelect
                label="Vehicle"
                value={vehicleFilter}
                options={vehicleTypeOptions.map((v) => ({ value: v, label: v }))}
                onChange={handleVehicleChange}
              />
              <FilterSelect
                label="Payment"
                value={paymentFilter}
                options={PAYMENT_OPTIONS}
                onChange={(v) => handlePaymentChange(v as typeof paymentFilter)}
              />
              <button
                type="button"
                aria-pressed={entryFilter === 'TODAY'}
                onClick={() => handleEntryChange(entryFilter === 'TODAY' ? 'ALL' : 'TODAY')}
                className={cn(FILTER_CHIP, entryFilter === 'TODAY' ? FILTER_CHIP_ON : FILTER_CHIP_OFF)}
              >
                {entryFilter === 'TODAY' && <Check className="h-3.5 w-3.5" />}
                Entered today
              </button>

              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="h-8 rounded-lg px-2 text-[13px] text-muted-foreground transition-[color,transform] duration-150 ease-out hover:text-foreground active:scale-[0.97]"
                >
                  Reset
                </button>
              )}

              <span className="ml-auto text-xs tabular-nums text-muted-foreground" aria-live="polite">
                {total.toLocaleString('en-IN')} session{total === 1 ? '' : 's'}
              </span>
            </div>
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-muted/50 px-4 py-2">
                <span className="text-[13px] font-medium tabular-nums text-foreground">
                  {selected.size} selected
                </span>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  <Button size="xs" variant="outline" onClick={handleBulkMarkPaid}>
                    Mark paid (cash)
                  </Button>
                  <Button size="xs" variant="outline" onClick={handleBulkForceExit}>
                    Force exit
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => handleExport(selectedRows())}>
                    Export
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())} aria-label="Clear selection">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {pageRows.length === 0 ? (
              <div className="flex flex-col items-center gap-3 border-t border-border/60 px-4 py-14 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Search className="h-4 w-4" />
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">No sessions match</span>
                  <span className="text-[13px] text-muted-foreground">
                    {search.trim() ? `Nothing for “${search.trim()}” in this view.` : 'Try a different status or filter.'}
                  </span>
                </div>
                {(hasFilters || tab !== 'ALL') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      clearFilters();
                      handleTabChange('ALL');
                    }}
                  >
                    Show all sessions
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Wide: a table whose columns fold away as the card narrows. Sized off
                    the card (container query), not the viewport, because the sidebar
                    takes a varying share of the screen. Plates never truncate — the
                    secondary columns give way first. */}
                <Table className="hidden @2xl:table">
                  <TableHeader className="bg-muted/50 dark:bg-muted/30">
                    <TableRow className="border-y border-border/60 hover:bg-transparent">
                      <TableHead className="h-8 w-10 pr-0 pl-4">
                        <Checkbox
                          checked={pageAllSelected}
                          indeterminate={!pageAllSelected && pageRows.some((s) => selected.has(s.ticket_number))}
                          onCheckedChange={() => togglePageAll()}
                          aria-label="Select all sessions on this page"
                        />
                      </TableHead>
                      <TableHead className={TH}>Vehicle</TableHead>
                      <TableHead className={cn(TH, 'hidden @4xl:table-cell')}>Ticket</TableHead>
                      <TableHead className={TH}>Time</TableHead>
                      <TableHead className={TH}>Duration</TableHead>
                      {showStatus && <TableHead className={cn(TH, 'hidden @5xl:table-cell')}>Status</TableHead>}
                      <TableHead className={cn(TH, 'text-right')}>Amount</TableHead>
                      <TableHead className="h-8 w-px pr-4">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  {/* Keyed so a new page or filter fades in instead of hard-swapping. */}
                  <TableBody key={bodyKey} className="scope-fade">
                    {pageRows.map((s) => {
                      const v = rowView(s);
                      return (
                        <TableRow
                          key={s.id}
                          data-state={v.isSelected ? 'selected' : undefined}
                          onClick={(e) => openFromRow(e, s.ticket_number)}
                          className="cursor-pointer border-border/60 transition-colors duration-150 hover:bg-muted/40 active:bg-muted/70 data-[state=selected]:bg-primary/[0.04] dark:data-[state=selected]:bg-primary/10"
                        >
                          <TableCell className="py-3 pr-0 pl-4">
                            <Checkbox
                              checked={v.isSelected}
                              onCheckedChange={() => toggleRow(s.ticket_number)}
                              aria-label={`Select ticket ${s.ticket_number}`}
                            />
                          </TableCell>
                          <TableCell className="px-3 py-3">
                            <div className="flex items-center gap-3">
                              <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground @3xl:flex">
                                <v.VehicleIcon className="h-4 w-4" />
                              </span>
                              <div className="flex flex-col items-start gap-1">
                                {sessionLink(s.ticket_number, <Plate value={s.license_plate} />)}
                                <span className="text-xs text-muted-foreground">
                                  {s.vehicle_type}
                                  <span className="@4xl:hidden"> · {s.ticket_number}</span>
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden px-3 py-3 @4xl:table-cell">
                            <span className="block text-[13px] font-medium tabular-nums text-foreground">{s.ticket_number}</span>
                            <span className="block text-xs text-muted-foreground">{s.registered_staff_member || 'Visitor'}</span>
                          </TableCell>
                          <TableCell className="px-3 py-3">
                            <TimeRange s={s} day={v.day} />
                          </TableCell>
                          <TableCell className="px-3 py-3">
                            <DurationCell v={v} />
                          </TableCell>
                          {showStatus && (
                            <TableCell className="hidden px-3 py-3 @5xl:table-cell">
                              <StatusLabel status={s.status} />
                            </TableCell>
                          )}
                          <TableCell className="px-3 py-3 text-right">
                            <AmountCell v={v} />
                          </TableCell>
                          <TableCell className="py-3 pr-4 pl-2 text-right">{renderActions(s, v)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Narrow: one stacked row per session. Plate and amount hold their
                    width; everything else wraps underneath. */}
                <ul key={`m-${bodyKey}`} className="scope-fade divide-y divide-border/60 border-t border-border/60 @2xl:hidden">
                  {pageRows.map((s) => {
                    const v = rowView(s);
                    return (
                      <li
                        key={s.id}
                        data-state={v.isSelected ? 'selected' : undefined}
                        onClick={(e) => openFromRow(e, s.ticket_number)}
                        className="flex cursor-pointer gap-3 px-4 py-3.5 transition-colors duration-150 active:bg-muted/70 data-[state=selected]:bg-primary/[0.04] dark:data-[state=selected]:bg-primary/10"
                      >
                        <div className="pt-1">
                          <Checkbox
                            checked={v.isSelected}
                            onCheckedChange={() => toggleRow(s.ticket_number)}
                            aria-label={`Select ticket ${s.ticket_number}`}
                          />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <div className="flex flex-col items-start gap-1">
                              {sessionLink(s.ticket_number, <Plate value={s.license_plate} />)}
                              <span className="text-xs text-muted-foreground">
                                {s.vehicle_type} · {s.ticket_number}
                              </span>
                            </div>
                            <div className="ml-auto text-right">
                              <AmountCell v={v} />
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <StatusLabel status={s.status} className="text-xs" />
                              <span className="whitespace-nowrap tabular-nums">
                                {v.day} · {formatTime(s.entry_time, 'HH:mm')}
                              </span>
                              <span
                                className={cn(
                                  'whitespace-nowrap tabular-nums',
                                  v.overstay ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-foreground'
                                )}
                              >
                                {s.auto_closed ? 'Auto-closed' : formatDuration(v.minutes)}
                              </span>
                            </div>
                            {renderActions(s, v)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <Pager
              page={clampedPage}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
              className="border-t border-border/60 px-4 py-2.5"
            />
          </section>
        </div>
      )}
    </PageShell>
  );
};

export default SessionsPage;
