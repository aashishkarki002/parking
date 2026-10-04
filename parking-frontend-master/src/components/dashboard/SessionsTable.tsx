import { useState } from 'react';
import { useGetDashboardSessionsQuery, type DashboardCounts } from '@/app/(public)/(pages)/home/_redux/api';
import { Pager } from '@/components/Pager';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SessionsTableProps {
  /** The range picked in the scope bar, as ISO instants (end exclusive). */
  start: string;
  end: string;
  /** Sessions per raw status across the whole range, most common first. */
  statusCounts: DashboardCounts;
  loading: boolean;
  /** e.g. "today", "this week" — as the scope bar names the window. */
  scopeLabel: string;
  /** Changes whenever the range does, so paging starts over on a new range. */
  scopeKey: string;
}

const PAGE_SIZE = 10;

const humanize = (raw: string) =>
  raw
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

// One quiet dot per status; the label carries the meaning, colour only helps
// the eye group rows. Anything unknown falls back to neutral.
const STATUS_DOT: Record<string, string> = {
  active: 'bg-blue-500',
  completed: 'bg-emerald-500',
  paid: 'bg-emerald-500',
  waived: 'bg-zinc-400 dark:bg-zinc-500',
  cancelled: 'bg-red-500',
};

const count = new Intl.NumberFormat('en-IN');
const money = (n: number) => `NRs ${count.format(Math.round(n))}`;

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function formatEntry(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const now = new Date();
  if (sameDay(d, now)) return { day: 'Today', time };
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return { day: 'Yesterday', time };
  return { day: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), time };
}

export function SessionsTable({ start, end, statusCounts, loading: summaryLoading, scopeLabel, scopeKey }: SessionsTableProps) {
  const [status, setStatus] = useState('all');
  // Page is remembered per range + filter; switching either starts at page 1.
  const [paging, setPaging] = useState({ key: '', page: 1 });
  const pageKey = `${scopeKey}|${status}`;

  const statuses = statusCounts;
  const totalSessions = statuses.reduce((sum, [, n]) => sum + n, 0);

  // A filter left over from a range that no longer has that status would show
  // an empty table with no visible reason — fall back to All instead.
  const activeStatus = status === 'all' || statuses.some(([s]) => s === status) ? status : 'all';

  const filteredTotal =
    activeStatus === 'all' ? totalSessions : (statuses.find(([s]) => s === activeStatus)?.[1] ?? 0);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const page = Math.min(paging.key === pageKey ? paging.page : 1, totalPages);
  const setPage = (p: number) => setPaging({ key: pageKey, page: p });

  // Only the visible page is fetched; the counts above come with the summary.
  const { currentData, isError } = useGetDashboardSessionsQuery(
    { start, end, status: activeStatus, page, page_size: PAGE_SIZE },
    { skip: summaryLoading }
  );
  const rows = currentData?.results ?? [];
  const loading = summaryLoading || (!currentData && !isError);

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6 sm:px-5">
        <div className="shrink-0">
          <h2 className="text-sm font-medium text-foreground">Sessions</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {summaryLoading ? 'Loading…' : `${count.format(totalSessions)} ${scopeLabel}`}
          </p>
        </div>

        {!summaryLoading && statuses.length > 0 && (
          <div
            role="radiogroup"
            aria-label="Filter by status"
            className="-mx-4 flex min-w-0 gap-0.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:rounded-lg sm:bg-muted sm:p-0.5 sm:px-0.5"
          >
            {[['all', totalSessions] as const, ...statuses].map(([value, n]) => {
              const selected = value === activeStatus;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setStatus(value)}
                  className={cn(
                    'flex h-7 shrink-0 select-none items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium',
                    'transition-[color,background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100',
                    'outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border/60'
                      : 'bg-muted text-muted-foreground hover:text-foreground sm:bg-transparent'
                  )}
                >
                  {value === 'all' ? 'All' : humanize(value)}
                  <span className="tabular-nums text-muted-foreground">{count.format(n)}</span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 pl-4 pr-2 font-normal sm:pl-5">Vehicle</th>
              <th className="px-2 py-2 font-normal">Status</th>
              <th className="hidden px-2 py-2 font-normal sm:table-cell">Entry</th>
              <th className="py-2 pl-2 pr-4 text-right font-normal sm:pr-5">Charge</th>
            </tr>
          </thead>

          {/* Keyed so the rows fade in when they arrive; skeletons don't. */}
          <tbody key={loading ? 'loading' : `${pageKey}|${page}`} className={loading ? undefined : 'scope-fade'}>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="py-3 pl-4 pr-2 sm:pl-5">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="mt-1.5 h-3 w-32" />
                    </td>
                    <td className="px-2 py-3">
                      <Skeleton className="h-3.5 w-20" />
                    </td>
                    <td className="hidden px-2 py-3 sm:table-cell">
                      <Skeleton className="h-3.5 w-24" />
                    </td>
                    <td className="py-3 pl-2 pr-4 sm:pr-5">
                      <Skeleton className="ml-auto h-3.5 w-14" />
                    </td>
                  </tr>
                ))
              : rows.map((s) => {
                  const entry = formatEntry(s.entry_time);
                  const charge = s.calculated_charge == null ? null : Number(s.calculated_charge);
                  return (
                    <tr key={s.id} className="border-t border-border/60 transition-colors hover:bg-muted/40">
                      <td className="max-w-[180px] py-2.5 pl-4 pr-2 sm:pl-5">
                        <div className="truncate font-medium text-foreground">{s.license_plate}</div>
                        <div className="truncate text-xs tabular-nums text-muted-foreground">
                          {s.ticket_number}
                          <span className="sm:hidden"> · {entry.time}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="inline-flex items-center gap-2 whitespace-nowrap text-foreground">
                          <span
                            className={cn(
                              'h-1.5 w-1.5 shrink-0 rounded-full',
                              STATUS_DOT[s.status.toLowerCase()] ?? 'bg-amber-500'
                            )}
                          />
                          {humanize(s.status)}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap px-2 py-2.5 tabular-nums sm:table-cell">
                        <span className="text-foreground">{entry.time}</span>
                        <span className="ml-1.5 text-muted-foreground">{entry.day}</span>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pl-2 pr-4 text-right tabular-nums sm:pr-5">
                        {charge === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={charge === 0 ? 'text-muted-foreground' : 'text-foreground'}>
                            {money(charge)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>

        {!loading && rows.length === 0 && (
          <div className="border-t border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
            No sessions {scopeLabel}
          </div>
        )}
      </div>

      {!loading && rows.length > 0 && (
        <Pager
          page={page - 1}
          pageSize={PAGE_SIZE}
          total={filteredTotal}
          onPageChange={(p) => setPage(p + 1)}
          className="border-t border-border/60 px-4 py-2.5 sm:px-5"
        />
      )}
    </section>
  );
}
