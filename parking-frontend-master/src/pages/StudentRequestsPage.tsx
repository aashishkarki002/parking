import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { toast } from 'react-toastify';
import {
  CheckIcon,
  InboxStackIcon,
  MagnifyingGlassIcon,
  PrinterIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { formatDate, formatTime } from '@/functions/dateFn';
import { cn } from '@/lib/utils';
import { RequestBadge } from '@/components/students/StatusBadge';
import { StudentTable } from '@/components/students/StudentTable';
import {
  openStudentCard,
  useGetStudentRequestQuery,
  useGetStudentRequestsQuery,
  useReviewStudentRequestMutation,
} from '@/components/students/api';
import type { ReviewStatus, Student, StudentRequest } from '@/components/students/types';

type Filter = 'pending' | 'reviewed' | 'all';
type StudentFilter = 'ALL' | ReviewStatus;

// Most rejections are one of these; a tap fills the reason in.
const QUICK_REASONS = [
  "Vehicle number doesn't match registration",
  'Duplicate entry',
  'Not enrolled in this batch',
  'Missing contact number',
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const matches = (s: Student, q: string) =>
  !q || [s.name, s.license_plate, s.contact_number, s.sn].some((v) => v?.toLowerCase().includes(q));

// Approved / rejected / pending as one thin bar — progress at a glance.
function ReviewProgress({ counts }: { counts: StudentRequest['counts'] }) {
  const total = Math.max(counts.total, 1);
  const seg = (n: number) => ({ width: `${(n / total) * 100}%` });
  return (
    <div className="flex h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <span className="bg-emerald-500 transition-[width] duration-300" style={seg(counts.approved)} />
      <span className="bg-red-500 transition-[width] duration-300" style={seg(counts.rejected)} />
      <span className="bg-amber-400 transition-[width] duration-300" style={seg(counts.pending)} />
    </div>
  );
}

function RejectDialog({
  names,
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  names: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  busy: boolean;
}) {
  // Remounted per opening (see `key` at the call site), so this starts empty.
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const confirm = () => trimmed && !busy && onConfirm(trimmed);
  const who = names.length === 1 ? names[0] : plural(names.length, 'student');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject {who}?</DialogTitle>
          <DialogDescription>The tenant sees this reason next to each rejected student.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-5 py-3">
          {names.length > 1 && names.length <= 4 && (
            <p className="text-[12px] text-muted-foreground">{names.join(', ')}</p>
          )}
          <Textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) confirm();
            }}
            placeholder="Why is this being rejected?"
            maxLength={255}
          />
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11.5px] transition-[transform,background-color] duration-100 active:scale-[0.97]',
                  reason === r
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">⌘ Enter to reject</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={busy || !trimmed}>
              {busy ? 'Rejecting…' : 'Reject'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Floats over the table while rows are selected. Always mounted so it leaves
// the way it came (slides back down) instead of vanishing.
function SelectionBar({
  count,
  busy,
  onClear,
  onApprove,
  onReject,
}: {
  count: number;
  busy: boolean;
  onClear: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const open = count > 0;
  // Keep showing the last count while the bar animates out.
  const [shown, setShown] = useState(count);
  if (count > 0 && count !== shown) setShown(count);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div
        data-open={open}
        aria-hidden={!open}
        role="toolbar"
        aria-label="Selected students"
        className={cn(
          'pointer-events-auto flex items-center gap-1 rounded-2xl border border-white/40 bg-background/75 p-1.5 pl-4 shadow-[0_10px_40px_-8px_rgb(0_0_0/0.25)] backdrop-blur-xl backdrop-saturate-[1.8] dark:border-white/10',
          'transition-[transform,opacity,visibility] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-opacity',
          'data-[open=false]:invisible data-[open=false]:translate-y-6 data-[open=false]:scale-95 data-[open=false]:opacity-0 motion-reduce:data-[open=false]:translate-y-0 motion-reduce:data-[open=false]:scale-100',
          '[@media(prefers-reduced-transparency:reduce)]:bg-background [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none'
        )}
      >
        <span className="mr-2 text-[13px] font-semibold tabular-nums">{shown} selected</span>
        <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
          Clear
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button variant="destructive" size="sm" onClick={onReject} disabled={busy}>
          <XMarkIcon /> Reject
        </Button>
        <Button size="sm" onClick={onApprove} disabled={busy}>
          <CheckIcon /> Approve
        </Button>
      </div>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

function RequestReview({ id }: { id: number }) {
  const { data, isLoading } = useGetStudentRequestQuery(id);
  const [review, { isLoading: saving }] = useReviewStudentRequestMutation();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Who the reject dialog is about: the selection, or a single row's quick action.
  const [rejectIds, setRejectIds] = useState<number[] | null>(null);
  const [show, setShow] = useState<StudentFilter>('ALL');
  const [query, setQuery] = useState('');

  const students = useMemo(() => data?.students ?? [], [data]);
  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => students.filter((s) => (show === 'ALL' || s.review_status === show) && matches(s, q)),
    [students, show, q]
  );

  // Esc clears the selection, as in any list.
  useEffect(() => {
    if (selected.size === 0 || rejectIds) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setSelected(new Set());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected.size, rejectIds]);

  if (isLoading || !data) return <ReviewSkeleton />;

  const pendingIds = students.filter((s) => s.review_status === 'PENDING').map((s) => s.id);
  const nameOf = (sid: number) => students.find((s) => s.id === sid)?.name ?? '';

  const toggle = (sid: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  const visibleSelected = visible.filter((s) => selected.has(s.id)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelected === visible.length;
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((s) => (allVisibleSelected ? next.delete(s.id) : next.add(s.id)));
      return next;
    });

  const run = async (body: { approve?: number[]; reject?: { id: number; reason: string }[] }, message: string) => {
    try {
      await review({ id, ...body }).unwrap();
      toast.success(message);
      const touched = [...(body.approve ?? []), ...(body.reject ?? []).map((r) => r.id)];
      setSelected((prev) => new Set([...prev].filter((sid) => !touched.includes(sid))));
      setRejectIds(null);
    } catch {
      // Interceptor toasts the error.
    }
  };

  const approve = (ids: number[]) =>
    run({ approve: ids }, ids.length === 1 ? `${nameOf(ids[0])} approved.` : `${ids.length} students approved.`);

  const tabs: { value: StudentFilter; label: string; count: number }[] = [
    { value: 'ALL', label: 'All', count: data.counts.total },
    { value: 'PENDING', label: 'Pending', count: data.counts.pending },
    { value: 'APPROVED', label: 'Approved', count: data.counts.approved },
    { value: 'REJECTED', label: 'Rejected', count: data.counts.rejected },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3 pb-24">
      <Card className="gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-semibold leading-tight tracking-[-0.015em]">{data.vendor_name}</h2>
              <RequestBadge status={data.status} />
            </div>
            <p className="mt-1 text-[12.5px] text-muted-foreground tabular-nums">
              Sent {formatDate(data.submitted_at)} at {formatTime(data.submitted_at)}
              {data.submitted_by && <> by {data.submitted_by}</>} · {data.source === 'MANUAL' ? 'typed in' : `${data.source} upload`}
            </p>
          </div>
          <Button
            size="lg"
            className="shrink-0 px-3.5 active:scale-[0.98]"
            disabled={saving || pendingIds.length === 0}
            onClick={() => approve(pendingIds)}
          >
            <CheckIcon />
            {pendingIds.length === 0 ? 'All reviewed' : `Approve all ${pendingIds.length} pending`}
          </Button>
        </div>

        {data.note && (
          <blockquote className="rounded-lg border-l-2 border-primary/40 bg-muted/40 px-3 py-2 text-[13px] text-foreground/80">
            {data.note}
          </blockquote>
        )}

        <ReviewProgress counts={data.counts} />
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={show} onValueChange={(v) => setShow(v as StudentFilter)}>
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                {t.label}
                <span className="text-[11px] text-muted-foreground tabular-nums">{t.count}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative sm:w-64">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, plate or phone"
            className="pl-8"
            aria-label="Search students"
          />
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <StudentTable
          students={visible}
          onRowClick={(s) => toggle(s.id)}
          isSelected={(s) => selected.has(s.id)}
          empty={q ? `No students match “${query.trim()}”.` : 'No students here.'}
          lead={{
            header: (
              <Checkbox
                aria-label="Select all shown"
                checked={allVisibleSelected}
                indeterminate={visibleSelected > 0 && !allVisibleSelected}
                onCheckedChange={toggleAllVisible}
              />
            ),
            cell: (s) => (
              <Checkbox aria-label={`Select ${s.name}`} checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
            ),
          }}
          trail={{
            header: <span className="sr-only">Actions</span>,
            cell: (s) =>
              s.review_status === 'PENDING' ? (
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Reject ${s.name}`}
                    title="Reject"
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    disabled={saving}
                    onClick={() => setRejectIds([s.id])}
                  >
                    <XMarkIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Approve ${s.name}`}
                    title="Approve"
                    className="text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400"
                    disabled={saving}
                    onClick={() => approve([s.id])}
                  >
                    <CheckIcon />
                  </Button>
                </div>
              ) : s.review_status === 'APPROVED' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  aria-label={`Print card for ${s.name}`}
                  onClick={() => openStudentCard(s.id).catch(() => undefined)}
                >
                  <PrinterIcon /> Card
                </Button>
              ) : null,
          }}
        />
      </Card>

      <SelectionBar
        count={selected.size}
        busy={saving}
        onClear={() => setSelected(new Set())}
        onApprove={() => approve([...selected])}
        onReject={() => setRejectIds([...selected])}
      />

      <RejectDialog
        key={String(rejectIds)}
        names={(rejectIds ?? []).map(nameOf)}
        open={rejectIds !== null}
        onOpenChange={(open) => !open && setRejectIds(null)}
        busy={saving}
        onConfirm={(reason) =>
          rejectIds &&
          run(
            { reject: rejectIds.map((sid) => ({ id: sid, reason })) },
            rejectIds.length === 1 ? `${nameOf(rejectIds[0])} rejected.` : `${rejectIds.length} students rejected.`
          )
        }
      />
    </div>
  );
}

function RequestList({
  requests,
  openId,
  onOpen,
}: {
  requests: StudentRequest[];
  openId: number | null;
  onOpen: (id: number) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? requests.filter((r) => r.vendor_name.toLowerCase().includes(q)) : requests;

  // Arrow keys walk the list, like a mail inbox.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const at = shown.findIndex((r) => r.id === openId);
    const next = shown[Math.min(Math.max(at + (e.key === 'ArrowDown' ? 1 : -1), 0), shown.length - 1)];
    if (!next) return;
    onOpen(next.id);
    e.currentTarget.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus();
  };

  return (
    <div className="flex flex-col gap-2 lg:sticky lg:top-4 lg:max-h-[calc(100svh-6rem)]">
      {requests.length > 4 && (
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a tenant"
            className="pl-8"
            aria-label="Find a tenant"
          />
        </div>
      )}
      <div
        className="-mx-1 flex min-h-0 flex-col gap-1.5 overflow-y-auto px-1 py-0.5 max-lg:max-h-[45svh]"
        onKeyDown={onKeyDown}
        role="listbox"
        aria-label="Requests"
      >
        {shown.length === 0 && <p className="px-1 py-6 text-center text-[12.5px] text-muted-foreground">No tenant matches.</p>}
        {shown.map((r) => {
          const active = openId === r.id;
          return (
            <button
              key={r.id}
              data-id={r.id}
              type="button"
              role="option"
              aria-selected={active}
              tabIndex={active || (openId === null && r === shown[0]) ? 0 : -1}
              onPointerDown={() => onOpen(r.id)}
              onClick={() => onOpen(r.id)}
              className={cn(
                'flex flex-col gap-2 rounded-xl border px-3.5 py-3 text-left outline-none',
                'transition-[background-color,border-color,transform,box-shadow] duration-150 active:scale-[0.985]',
                'focus-visible:ring-3 focus-visible:ring-ring/50',
                active
                  ? 'border-primary/40 bg-primary/[0.06] shadow-sm'
                  : 'border-border bg-card hover:border-foreground/15 hover:bg-muted/40'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em]">{r.vendor_name}</span>
                <RequestBadge status={r.status} />
              </div>
              <ReviewProgress counts={r.counts} />
              <span className="flex justify-between text-[11.5px] text-muted-foreground tabular-nums">
                <span>{formatDate(r.submitted_at, 'DD MMM')}</span>
                <span>
                  {r.counts.pending > 0 ? (
                    <>
                      <span className="font-medium text-foreground">{r.counts.pending}</span> of {r.counts.total} to review
                    </>
                  ) : (
                    plural(r.counts.total, 'student')
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Admin side of student parking: tenants' submitted lists, reviewed one
// student at a time (or all pending at once).
const StudentRequestsPage = () => {
  const [filter, setFilter] = useState<Filter>('pending');
  const { data = [], isLoading } = useGetStudentRequestsQuery(filter === 'all' ? undefined : { status: filter });
  // Shares the cache with the list above whenever the Pending tab is open.
  const { data: pending = [] } = useGetStudentRequestsQuery({ status: 'pending' });
  const [chosenId, setOpenId] = useState<number | null>(null);
  // Keep the chosen request open while it's still in the list; otherwise the first.
  const openId = data.some((r) => r.id === chosenId) ? chosenId : (data[0]?.id ?? null);

  return (
    <PageShell title="Student requests">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mb-4">
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">
            Pending
            {pending.length > 0 && (
              <span className="min-w-4 rounded-full bg-amber-400/90 px-1.5 text-[10.5px] leading-4 font-semibold text-amber-950 tabular-nums">
                {pending.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="flex flex-col gap-1.5">
            {[0, 1, 2].map((k) => (
              <Skeleton key={k} className="h-[76px] w-full rounded-xl" />
            ))}
          </div>
          <ReviewSkeleton />
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={InboxStackIcon}
          title={filter === 'pending' ? "You're all caught up" : 'No requests yet'}
          description={
            filter === 'pending'
              ? 'Every student list has been reviewed. New ones from tenants will appear here.'
              : 'Student lists tenants send from their portal appear here.'
          }
        />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <RequestList requests={data} openId={openId} onOpen={setOpenId} />
          {/* key: a different request starts with nothing selected */}
          {openId !== null && <RequestReview key={openId} id={openId} />}
        </div>
      )}
    </PageShell>
  );
};

export default StudentRequestsPage;
