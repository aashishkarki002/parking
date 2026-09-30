import { useState } from 'react';
import dayjs from 'dayjs';
import { ChevronDownIcon, ExclamationTriangleIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { PageShell } from '@/components/PageShell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { formatDate, formatTime } from '@/functions/dateFn';
import { useAppSelector } from '@/lib/public/hooks';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';
import { NewStudentRequest } from '@/components/students/NewStudentRequest';
import { RequestBadge } from '@/components/students/StatusBadge';
import { StudentTable } from '@/components/students/StudentTable';
import type { Student, StudentRequest } from '@/components/students/types';
import {
  useGetMyStudentRequestQuery,
  useGetMyStudentRequestsQuery,
  useGetMyStudentsQuery,
} from '@/components/students/api';

const SOURCE_LABEL = { MANUAL: 'Typed in', CSV: 'CSV upload', EXCEL: 'Excel upload' } as const;

type Tab = 'new' | 'requests' | 'students';
type StudentFilter = 'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED' | 'ENDING';

const FILTERS: { value: StudentFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ENDING', label: 'Ending soon' },
];

// Approved students whose batch ends in the next two weeks — worth renewing.
const endingSoon = (s: Student) => {
  if (s.review_status !== 'APPROVED' || !s.batch_end_date) return false;
  const days = dayjs(s.batch_end_date).startOf('day').diff(dayjs().startOf('day'), 'day');
  return days >= 0 && days <= 14;
};

const matchesFilter = (s: Student, filter: StudentFilter) =>
  filter === 'ALL' ? true : filter === 'ENDING' ? endingSoon(s) : s.review_status === filter;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// One cell of the summary strip. Number first; the label says what it counts.
function Stat({
  label,
  value,
  hint,
  dot,
  onClick,
}: {
  label: string;
  value: number | undefined;
  hint: string;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-0.5 px-4 py-3.5 text-left outline-none transition-colors duration-150 ease-out hover:bg-muted/50 focus-visible:bg-muted/50 active:bg-muted sm:px-5"
    >
      {value === undefined ? (
        <Skeleton className="my-0.5 h-7 w-10" />
      ) : (
        <span className="text-2xl leading-8 font-semibold tracking-[-0.02em] text-foreground tabular-nums">{value}</span>
      )}
      <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
        {dot && <span className={cn('size-1.5 rounded-full', dot)} aria-hidden />}
        {label}
      </span>
      <span className="text-[12px] text-muted-foreground">{hint}</span>
    </button>
  );
}

// Plain-text empty state with the next step inline — no illustration needed.
function Empty({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
      <p className="text-[14px] font-medium text-foreground">{title}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-1 text-[13px] text-muted-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-foreground hover:decoration-foreground/40"
      >
        {action}
      </button>
    </div>
  );
}

function RequestDetail({ id }: { id: number }) {
  const { data, isLoading } = useGetMyStudentRequestQuery(id);
  if (isLoading || !data) return <Skeleton className="m-4 h-24" />;
  return <StudentTable students={data.students ?? []} />;
}

// One bar split by review outcome, so progress reads at a glance.
function ReviewProgress({ counts }: { counts: StudentRequest['counts'] }) {
  const { total, approved, rejected, pending } = counts;
  if (!total) return null;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-56">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="bg-emerald-500" style={{ width: pct(approved) }} />
        <span className="bg-red-500" style={{ width: pct(rejected) }} />
        <span className="bg-amber-400" style={{ width: pct(pending) }} />
      </div>
      <p className="text-[12px] text-muted-foreground tabular-nums">
        {[
          approved && `${approved} approved`,
          rejected && `${rejected} rejected`,
          pending && `${pending} pending`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  );
}

function MyRequests({ onNew }: { onNew: () => void }) {
  const { data = [], isLoading } = useGetMyStudentRequestsQuery();
  const [openId, setOpenId] = useState<number | null>(null);

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (!data.length) {
    return <Empty title="You haven't sent any lists yet" action="Add your first students" onAction={onNew} />;
  }
  return (
    <Card className="gap-0 divide-y divide-border overflow-hidden p-0">
      {data.map((r) => {
        const open = openId === r.id;
        return (
          <div key={r.id}>
            <button
              type="button"
              onClick={() => setOpenId(open ? null : r.id)}
              aria-expanded={open}
              className="flex w-full flex-col gap-3 px-4 py-3.5 text-left outline-none transition-colors duration-100 hover:bg-muted/50 focus-visible:bg-muted/50 active:bg-muted sm:flex-row sm:items-center sm:gap-6 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">
                  {plural(r.counts.total, 'student')}
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground tabular-nums">
                  {formatDate(r.submitted_at)} at {formatTime(r.submitted_at)} · {SOURCE_LABEL[r.source]}
                </p>
              </div>
              <ReviewProgress counts={r.counts} />
              <div className="flex items-center gap-3 sm:w-40 sm:justify-end">
                <RequestBadge status={r.status} />
                <ChevronDownIcon
                  className={cn(
                    'ml-auto size-4 text-muted-foreground motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)] sm:ml-0',
                    open && 'rotate-180'
                  )}
                />
              </div>
            </button>
            {open && (
              <div className="overflow-x-auto border-t border-border bg-background">
                <RequestDetail id={r.id} />
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

function MyStudents({
  filter,
  onFilter,
  onNew,
}: {
  filter: StudentFilter;
  onFilter: (f: StudentFilter) => void;
  onNew: () => void;
}) {
  const { data = [], isLoading } = useGetMyStudentsQuery();
  const [search, setSearch] = useState('');

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (!data.length) {
    return <Empty title="No students registered" action="Send a list for approval" onAction={onNew} />;
  }
  const term = search.trim().toLowerCase();
  const plateTerm = term.replace(/\s+/g, '');
  const rows = data.filter(
    (s) =>
      matchesFilter(s, filter) &&
      (!term || s.name.toLowerCase().includes(term) || s.license_plate.toLowerCase().includes(plateTerm))
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search name or vehicle number"
            aria-label="Search students"
            className="h-9 pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div role="radiogroup" aria-label="Filter students" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {FILTERS.map((f) => {
            const count = data.filter((s) => matchesFilter(s, f.value)).length;
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onFilter(f.value)}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium outline-none transition-colors duration-100 focus-visible:ring-3 focus-visible:ring-ring/50',
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background text-foreground/70 hover:bg-muted hover:text-foreground'
                )}
              >
                {f.label}
                <span className={cn('tabular-nums', active ? 'text-background/70' : 'text-muted-foreground')}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <StudentTable
          students={rows}
          empty={term ? `No students match “${search.trim()}”.` : 'No students in this view.'}
        />
      </Card>

      <p className="max-w-2xl text-[12.5px] leading-5 text-muted-foreground">
        Approved, active students park free during class time on their class days, until their batch ends. Outside
        class time they pay like visitors unless you stamp their ticket. To change a student, contact the parking
        office.
      </p>
    </div>
  );
}

const TenantPortalPage = () => {
  const { currentUser } = useAppSelector(loginSelector);
  const vendor = currentUser?.vendor;
  const [tab, setTab] = useState<Tab>('new');
  const [filter, setFilter] = useState<StudentFilter>('ALL');
  const { data: students } = useGetMyStudentsQuery();
  const { data: requests } = useGetMyStudentRequestsQuery();

  const approved = students?.filter((s) => s.review_status === 'APPROVED' && s.is_active).length;
  const pending = students?.filter((s) => s.review_status === 'PENDING').length;
  const ending = students?.filter(endingSoon).length;
  const openRequests = requests?.filter((r) => r.status !== 'REVIEWED').length ?? 0;

  const showStudents = (f: StudentFilter) => {
    setFilter(f);
    setTab('students');
  };

  return (
    <PageShell title="Student parking">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        {!vendor && (
          <div role="alert" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
            <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-[13px] leading-5">
              <p className="font-semibold text-amber-900 dark:text-amber-200">This login isn't linked to a tenant yet</p>
              <p className="text-amber-800 dark:text-amber-300">Ask the parking office to set it up before sending students.</p>
            </div>
          </div>
        )}

        <header className="flex flex-col gap-1">
          <h2 className="text-xl leading-tight font-semibold tracking-[-0.015em] text-foreground">
            {vendor?.name ?? 'Your students'}
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Send a student list to the parking office. Once approved, students park free during their class hours.
          </p>
        </header>

        <section
          aria-label="Summary"
          className="grid divide-y divide-border overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        >
          <Stat
            label="Parking free"
            dot="bg-emerald-500"
            value={approved}
            hint="Approved and active"
            onClick={() => showStudents('APPROVED')}
          />
          <Stat
            label="Waiting for review"
            dot="bg-amber-400"
            value={pending}
            hint="With the parking office"
            onClick={() => showStudents('PENDING')}
          />
          <Stat
            label="Batches ending soon"
            value={ending}
            hint="In the next 2 weeks"
            onClick={() => showStudents('ENDING')}
          />
        </section>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-6">
          <TabsList variant="line" className="h-auto w-full justify-start gap-6 border-b border-border p-0">
            {(
              [
                ['new', 'Add students', null],
                ['requests', 'Requests', openRequests || null],
                ['students', 'Students', students?.length || null],
              ] as const
            ).map(([value, label, count]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="h-10 flex-none rounded-none px-0 text-[14px] group-data-horizontal/tabs:after:bottom-[-1px]"
              >
                {label}
                {count !== null && (
                  <span className="rounded-full bg-muted px-1.5 text-[11px] leading-[18px] font-semibold text-muted-foreground tabular-nums">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="new">
            <NewStudentRequest disabled={!vendor} onSubmitted={() => setTab('requests')} />
          </TabsContent>
          <TabsContent value="requests">
            <MyRequests onNew={() => setTab('new')} />
          </TabsContent>
          <TabsContent value="students">
            <MyStudents filter={filter} onFilter={setFilter} onNew={() => setTab('new')} />
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
};

export default TenantPortalPage;
