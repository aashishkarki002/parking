import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowDownLeft, ArrowUpRight, Ban, ChevronLeft, ChevronRight, Nfc, Search, ShieldAlert, X } from 'lucide-react';
import { useGetRfidTapsQuery, type RfidTap, type RfidTapLog } from '@/app/(public)/(pages)/home/_redux/api';
import { PageShell } from '@/components/PageShell';
import { Pager } from '@/components/Pager';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTime } from '@/functions/dateFn';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'ENTRY' | 'EXIT' | 'REJECTED';

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 250;
const count = new Intl.NumberFormat('en-IN');

// What the gate wrote in reject_reason (rfid.tap / rfid._entry_denied),
// said the way someone at the booth would say it.
const REJECT_LABEL: Record<string, string> = {
  'unknown or inactive RFID card': 'Card not recognised',
  access_revoked: 'Tenant access revoked',
  subscription_expired: 'No active subscription',
  no_vehicle_type: 'No vehicle type on file',
};

const dayLabel = (iso: string) => {
  const d = dayjs(iso);
  if (d.isSame(dayjs(), 'day')) return 'Today';
  if (d.isSame(dayjs().subtract(1, 'day'), 'day')) return 'Yesterday';
  return d.format(d.isSame(dayjs(), 'year') ? 'ddd, D MMM' : 'D MMM YYYY');
};

// Every tap the booth reader logged on one day: who came in, who left, and
// which cards the gate refused. Read-only — corrections happen on the home
// screen. Today's view refreshes itself, so it can sit open on a second
// screen at the booth.
const CardTapsPage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const today = dayjs().format('YYYY-MM-DD');
  const rawDate = params.get('date') ?? '';
  // ISO dates compare as strings; a future day has no taps to show.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && dayjs(rawDate).isValid() && rawDate < today ? rawDate : today;
  const isToday = date === today;
  const uid = params.get('uid')?.trim() || undefined;
  const rawFilter = params.get('action');
  const filter: Filter = rawFilter === 'ENTRY' || rawFilter === 'EXIT' || rawFilter === 'REJECTED' ? rawFilter : 'all';

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  // Paging starts over whenever what's being listed changes.
  const listKey = [date, filter, uid, q].join('|');
  const [paging, setPaging] = useState({ key: listKey, page: 0 });
  const page = paging.key === listKey ? paging.page : 0;

  const { data, isLoading, isFetching, isError, refetch } = useGetRfidTapsQuery(
    {
      date,
      action: filter === 'all' ? undefined : filter,
      q: q || undefined,
      uid,
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    },
    { pollingInterval: isToday ? 15000 : 0, skipPollingIfUnfocused: true }
  );

  const update = (patch: Record<string, string | null>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true }
    );
  };

  const shiftDay = (by: number) => {
    const next = dayjs(date).add(by, 'day').format('YYYY-MM-DD');
    update({ date: next === today ? null : next });
  };

  const setFilter = (f: Filter) => update({ action: f === 'all' || f === filter ? null : f });

  return (
    <PageShell title="Tap log">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DayStepper
            date={date}
            isToday={isToday}
            onPrev={() => shiftDay(-1)}
            onNext={() => shiftDay(1)}
            onPick={(d) => update({ date: d === today ? null : d })}
            onToday={() => update({ date: null })}
            max={today}
          />
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, plate, tenant or card number"
              className="h-10 rounded-xl pl-9"
              aria-label="Search taps"
            />
          </div>
        </div>

        {uid && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Showing one card
            <button
              type="button"
              onClick={() => update({ uid: null })}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pr-2 pl-3 font-mono text-[13px] text-foreground tabular-nums transition-[background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.97]"
            >
              {uid}
              <X className="h-3.5 w-3.5 text-muted-foreground" aria-label="Show all cards" />
            </button>
          </div>
        )}

        <DayHeadline data={data} loading={isLoading} />

        {data && data.summary.total > 0 && <HourStrip hours={data.hours} isToday={isToday} scopeKey={`${date}|${uid}`} />}

        <section className="overflow-clip rounded-2xl border border-border bg-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2.5">
            <FilterBar data={data} filter={filter} onFilter={setFilter} />
            {isToday && (
              <span className="flex items-center gap-1.5 pr-1 text-xs text-muted-foreground">
                <span className={cn('h-1.5 w-1.5 rounded-full bg-emerald-500', isFetching && 'animate-pulse')} />
                Live
              </span>
            )}
          </header>

          {isLoading ? (
            <ListSkeleton />
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
              <p className="text-sm text-muted-foreground">Couldn't load the taps for {dayLabel(date).toLowerCase()}.</p>
              <button type="button" onClick={() => refetch()} className="text-sm font-medium text-primary hover:underline">
                Try again
              </button>
            </div>
          ) : !data || data.results.length === 0 ? (
            <Empty date={date} filtered={filter !== 'all' || !!q || !!uid} />
          ) : (
            <div key={listKey} className="scope-fade">
              {groupByHour(data.results).map(({ hour, taps }) => (
                <section key={hour} aria-label={hourLabel(hour)}>
                  <h3 className="sticky top-0 z-[1] border-b border-border bg-muted/70 px-4 py-1.5 text-xs font-medium text-muted-foreground tabular-nums backdrop-blur-sm">
                    {hourLabel(hour)}
                    <span className="ml-1.5 text-muted-foreground/70">{taps.length}</span>
                  </h3>
                  <ul className="divide-y divide-border">
                    {taps.map((tap) => (
                      <TapRow
                        key={tap.id}
                        tap={tap}
                        onIdentify={() => navigate(`/identify-card?uid=${encodeURIComponent(tap.uid)}`)}
                        onOnlyThisCard={uid ? undefined : () => update({ uid: tap.uid })}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {data && data.count > PAGE_SIZE && (
            <Pager
              className="border-t border-border px-4 py-2.5"
              page={page}
              pageSize={PAGE_SIZE}
              total={data.count}
              onPageChange={(p) => setPaging({ key: listKey, page: p })}
            />
          )}
        </section>
      </div>
    </PageShell>
  );
};

function DayStepper({
  date,
  isToday,
  max,
  onPrev,
  onNext,
  onPick,
  onToday,
}: {
  date: string;
  isToday: boolean;
  max: string;
  onPrev: () => void;
  onNext: () => void;
  onPick: (date: string) => void;
  onToday: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <StepButton label="Previous day" onClick={onPrev}>
        <ChevronLeft className="h-4 w-4" />
      </StepButton>
      {/* The label is the date picker: clicking it opens the native calendar. */}
      <label className="relative cursor-pointer rounded-lg px-2 py-1 transition-colors hover:bg-muted">
        <span className="block text-[17px] leading-tight font-semibold tracking-tight text-foreground">{dayLabel(date)}</span>
        <span className="block text-xs text-muted-foreground tabular-nums">{dayjs(date).format('dddd, D MMMM YYYY')}</span>
        <input
          type="date"
          value={date}
          max={max}
          onChange={(e) => e.target.value && onPick(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
          aria-label="Pick a day"
        />
      </label>
      <StepButton label="Next day" onClick={onNext} disabled={isToday}>
        <ChevronRight className="h-4 w-4" />
      </StepButton>
      {!isToday && (
        <button
          type="button"
          onClick={onToday}
          className="ml-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.97]"
        >
          Today
        </button>
      )}
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-[background-color,transform,opacity] duration-150 ease-out outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.94] disabled:pointer-events-none disabled:opacity-30 motion-reduce:active:scale-100"
    >
      {children}
    </button>
  );
}

const TONES = {
  entry: { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', soft: 'bg-emerald-500/10' },
  exit: { dot: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-400', soft: 'bg-sky-500/10' },
  rejected: { dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400', soft: 'bg-red-500/10' },
} as const;

// The day in one line — how many taps, from how many cards — and a second
// line only when something needs a look: refused cards, staff corrections.
function DayHeadline({ data, loading }: { data: RfidTapLog | undefined; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="space-y-2 pt-1">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }
  const s = data.summary;
  const notes: { text: string; alert?: boolean }[] = [];
  if (s.rejected) notes.push({ text: `${count.format(s.rejected)} rejected${s.unknown ? ` (${s.unknown} unknown card${s.unknown === 1 ? '' : 's'})` : ''}`, alert: true });
  if (s.forced) notes.push({ text: `${s.forced} ${s.forced === 1 ? 'entry' : 'entries'} fixed by staff` });

  return (
    <div className="pt-1">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[40px] leading-none font-semibold tracking-[-0.03em] text-foreground tabular-nums">
          {count.format(s.total)}
        </span>
        <span className="text-[17px] text-muted-foreground">
          {s.total === 1 ? 'tap' : 'taps'}
          {s.total > 0 && <> from {count.format(s.cards)} {s.cards === 1 ? 'card' : 'cards'}</>}
        </span>
      </p>
      {notes.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          {notes.map((n, i) => (
            <span key={n.text}>
              {i > 0 && ' · '}
              <span className={cn(n.alert && 'font-medium text-red-700 dark:text-red-400')}>{n.text}</span>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

// The list's filter carries the day's counts, so the numbers sit right where
// they narrow what you're reading.
function FilterBar({ data, filter, onFilter }: { data: RfidTapLog | undefined; filter: Filter; onFilter: (f: Filter) => void }) {
  const s = data?.summary;
  const options: { key: Filter; label: string; value?: number; tone?: keyof typeof TONES }[] = [
    { key: 'all', label: 'All', value: s?.total },
    { key: 'ENTRY', label: 'In', value: s?.entries, tone: 'entry' },
    { key: 'EXIT', label: 'Out', value: s?.exits, tone: 'exit' },
    { key: 'REJECTED', label: 'Rejected', value: s?.rejected, tone: 'rejected' },
  ];

  return (
    <div role="radiogroup" aria-label="Show" className="flex items-center gap-0.5 rounded-xl bg-muted/60 p-0.5">
      {options.map((o) => {
        const selected = filter === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onFilter(o.key)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium',
              'transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {o.tone && <span className={cn('h-1.5 w-1.5 rounded-full', TONES[o.tone].dot)} />}
            {o.label}
            {o.value !== undefined && (
              <span
                className={cn(
                  'tabular-nums',
                  selected ? 'text-muted-foreground' : 'text-muted-foreground/70',
                  o.tone === 'rejected' && o.value > 0 && 'text-red-700 dark:text-red-400'
                )}
              >
                {count.format(o.value)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const hourLabel = (hour: number) => dayjs().hour(hour).minute(0).format('h A');

// Taps arrive newest first, so consecutive runs of the same hour are a group.
function groupByHour(taps: RfidTap[]) {
  const groups: { hour: number; taps: RfidTap[] }[] = [];
  for (const tap of taps) {
    const hour = dayjs(tap.scanned_at).hour();
    const last = groups[groups.length - 1];
    if (last && last.hour === hour) last.taps.push(tap);
    else groups.push({ hour, taps: [tap] });
  }
  return groups;
}

// When the gate was busy: one column per hour, entries stacked under exits,
// rejections on top in red so a run of refused cards stands out.
function HourStrip({ hours, isToday, scopeKey }: { hours: RfidTapLog['hours']; isToday: boolean; scopeKey: string }) {
  const peak = useMemo(() => Math.max(1, ...hours.map((h) => h.entries + h.exits + h.rejected)), [hours]);
  const nowHour = new Date().getHours();

  return (
    <section aria-label="Taps by hour">
      <div className="mb-2 flex items-center justify-end">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Legend tone="entry" label="In" />
          <Legend tone="exit" label="Out" />
          <Legend tone="rejected" label="Rejected" />
        </div>
      </div>
      <div key={scopeKey} className="scope-fade flex h-20 items-end gap-[3px]">
        {hours.map((h) => {
          const total = h.entries + h.exits + h.rejected;
          const future = isToday && h.hour > nowHour;
          return (
            <div
              key={h.hour}
              title={`${String(h.hour).padStart(2, '0')}:00 — ${h.entries} in, ${h.exits} out${h.rejected ? `, ${h.rejected} rejected` : ''}`}
              className="relative flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              {isToday && h.hour === nowHour && (
                <span aria-hidden className="absolute -top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-foreground/60" />
              )}
              {total === 0 ? (
                <div className={cn('h-[2px] rounded-full', future ? 'bg-border/50' : 'bg-border')} />
              ) : (
                <div className="flex flex-col overflow-hidden rounded-[3px]" style={{ height: `${Math.max(6, (total / peak) * 100)}%` }}>
                  <div className={TONES.rejected.dot} style={{ flexGrow: h.rejected }} />
                  <div className={TONES.exit.dot} style={{ flexGrow: h.exits }} />
                  <div className={TONES.entry.dot} style={{ flexGrow: h.entries }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between border-t border-border pt-1.5 text-[11px] text-muted-foreground tabular-nums">
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>12a</span>
      </div>
    </section>
  );
}

function Legend({ tone, label }: { tone: keyof typeof TONES; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-[2px]', TONES[tone].dot)} />
      {label}
    </span>
  );
}

function tapMeta(tap: RfidTap) {
  switch (tap.action) {
    case 'ENTRY':
      return { label: 'Entered', tone: TONES.entry, Icon: ArrowDownLeft };
    case 'FORCED_ENTRY':
      return { label: 'Entered · staff fix', tone: TONES.entry, Icon: ShieldAlert };
    case 'EXIT':
      return { label: 'Exited', tone: TONES.exit, Icon: ArrowUpRight };
    default:
      return { label: 'Rejected', tone: TONES.rejected, Icon: Ban };
  }
}

function TapRow({ tap, onIdentify, onOnlyThisCard }: { tap: RfidTap; onIdentify: () => void; onOnlyThisCard?: () => void }) {
  const { label, tone, Icon } = tapMeta(tap);
  const rejected = tap.action === 'REJECTED';
  const reason = rejected
    ? tap.card_known && tap.card_active === false
      ? 'Card blocked'
      : REJECT_LABEL[tap.reject_reason] ?? tap.reject_reason
    : null;

  return (
    <li className="group flex items-center gap-3 px-4 py-3 sm:gap-4">
      <span className="w-[62px] shrink-0 text-[13px] text-muted-foreground tabular-nums">{formatTime(tap.scanned_at, 'h:mm a')}</span>

      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', tone.soft, tone.text)}>
        <Icon className="h-4 w-4" />
      </span>

      <button type="button" onClick={onIdentify} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[15px] font-medium text-foreground">
          {tap.tenant?.name ?? (tap.card_known ? 'Unassigned card' : 'Unknown card')}
        </span>
        <span className="block truncate text-[12.5px] text-muted-foreground">
          <span className={cn('font-medium', tone.text)}>{label}</span>
          {reason && <> · {reason}</>}
          {tap.tenant && [tap.tenant.license_plate, tap.tenant.company].filter(Boolean).map((part) => <span key={part}> · {part}</span>)}
        </span>
      </button>

      {onOnlyThisCard ? (
        <button
          type="button"
          onClick={onOnlyThisCard}
          title="Only this card's taps"
          className="hidden shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[12.5px] text-muted-foreground tabular-nums transition-colors hover:bg-muted hover:text-foreground sm:block"
        >
          {tap.uid}
        </button>
      ) : (
        <span className="hidden shrink-0 px-1.5 font-mono text-[12.5px] text-muted-foreground tabular-nums sm:block">{tap.uid}</span>
      )}
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ date, filtered }: { date: string; filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Nfc className="h-6 w-6" />
      </span>
      <div>
        <p className="text-[15px] font-medium text-foreground">{filtered ? 'Nothing matches' : 'No taps yet'}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {filtered
            ? 'Try another filter or clear the search.'
            : `No card was tapped at the reader ${dayLabel(date) === 'Today' ? 'today' : `on ${dayjs(date).format('D MMM')}`}.`}
        </p>
      </div>
    </div>
  );
}

export default CardTapsPage;
