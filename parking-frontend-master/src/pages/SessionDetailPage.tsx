import { createElement, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ChevronDown, ChevronLeft, TicketX } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  useGetSessionByTicketQuery,
  usePaymentMethodMutation,
  usePrintBillMutation,
} from '@/app/(public)/(pages)/home/_redux/api';
import { PageShell } from '@/components/PageShell';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  OVERSTAY_MINUTES,
  formatAmount,
  formatDuration,
  paymentLabel,
  type ParkingSessionDetail,
  type PaymentMethod,
} from '@/components/sessions/session';
import { Plate, StatusLabel } from '@/components/sessions/SessionBits';
import { vehicleIconFor } from '@/functions/vehicleIcon';
import { cn } from '@/lib/utils';

const at = (iso: string) => dayjs(iso).format('HH:mm');
const on = (iso: string, now: dayjs.Dayjs) => {
  const d = dayjs(iso);
  if (d.isSame(now, 'day')) return 'Today';
  if (d.isSame(now.subtract(1, 'day'), 'day')) return 'Yesterday';
  return d.format(d.isSame(now, 'year') ? 'ddd, D MMM' : 'D MMM YYYY');
};

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col rounded-xl border border-border bg-card', className)}>
      <h2 className="px-4 pt-4 pb-2 text-sm font-medium text-foreground sm:px-5">{title}</h2>
      {children}
    </section>
  );
}

// Label left, value right, hairline between rows — a settings-style list.
function Row({ label, children, tone }: { label: string; children: ReactNode; tone?: 'muted' | 'strong' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border/60 px-4 py-2.5 first:border-t-0 sm:px-5">
      <dt className="shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'min-w-0 text-right text-[13px] tabular-nums break-words',
          tone === 'strong' ? 'font-semibold text-foreground' : tone === 'muted' ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'warn' | 'danger' }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-card px-4 py-3.5 sm:px-5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-xl leading-none font-semibold tracking-[-0.01em] tabular-nums',
          tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : tone === 'danger' ? 'text-destructive' : 'text-foreground'
        )}
      >
        {value}
      </span>
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

type Moment = { key: string; title: string; detail?: string; time?: string; day?: string; tone: 'start' | 'mid' | 'end' | 'live' };

function Timeline({ moments }: { moments: Moment[] }) {
  return (
    <ol className="flex flex-col px-4 pb-4 sm:px-5">
      {moments.map((m, i) => {
        const last = i === moments.length - 1;
        return (
          <li key={m.key} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && <span aria-hidden className="absolute top-4 bottom-0 left-[5px] w-px bg-border" />}
            <span
              aria-hidden
              className={cn(
                'relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2',
                m.tone === 'live'
                  ? 'border-blue-500 bg-blue-500/20'
                  : m.tone === 'end'
                    ? 'border-foreground bg-foreground'
                    : m.tone === 'mid'
                      ? 'border-border bg-card'
                      : 'border-foreground bg-card'
              )}
            />
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <div className="flex min-w-0 flex-col">
                <span className="text-[13px] font-medium text-foreground">{m.title}</span>
                {m.detail && <span className="text-xs text-muted-foreground">{m.detail}</span>}
              </div>
              {m.time && (
                <span className="text-[13px] whitespace-nowrap tabular-nums text-foreground">
                  {m.time}
                  {m.day && <span className="ml-1.5 text-muted-foreground">{m.day}</span>}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-9 w-40 rounded-md" />
        <Skeleton className="mt-3 h-3.5 w-48" />
        <div className="mt-5 grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-56 rounded-xl lg:col-span-3" />
        <Skeleton className="h-56 rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}

const SessionDetailPage = () => {
  const { ticket = '' } = useParams();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from ?? '/sessions';

  const { data, isLoading, isError, isFetching } = useGetSessionByTicketQuery(ticket, { skip: !ticket });
  const s = data as ParkingSessionDetail | undefined;
  const [closeSession, { isLoading: closing }] = usePrintBillMutation();
  const [markPaid, { isLoading: paying }] = usePaymentMethodMutation();
  const busy = closing || paying || isFetching;

  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleClose = async () => {
    try {
      await closeSession({ ticketNo: ticket }).unwrap();
      toast.success(`Ticket ${ticket} closed.`);
    } catch {
      toast.error(`Could not close ticket ${ticket}.`);
    }
  };
  const handlePaid = async (method: PaymentMethod) => {
    try {
      await markPaid({ ticketNo: ticket, payment_method: method }).unwrap();
      toast.success(`Ticket ${ticket} marked paid.`);
    } catch {
      toast.error(`Could not mark ticket ${ticket} as paid.`);
    }
  };

  const back = (
    <Link
      to={backTo}
      className="-ml-1.5 inline-flex h-8 items-center gap-0.5 self-start rounded-lg pr-2.5 pl-1 text-[13px] text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] motion-reduce:active:scale-100"
    >
      <ChevronLeft className="h-4 w-4" />
      Sessions
    </Link>
  );

  if (isLoading) {
    return (
      <PageShell title="Session">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          {back}
          <DetailSkeleton />
        </div>
      </PageShell>
    );
  }

  if (isError || !s) {
    return (
      <PageShell title="Session">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          {back}
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-4 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <TicketX className="h-5 w-5" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold text-foreground">Ticket {ticket} not found</h2>
              <p className="text-[13px] text-muted-foreground">It may have been removed, or the link is wrong.</p>
            </div>
            <Link to={backTo} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Back to sessions
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const live = s.status === 'ACTIVE';
  const minutes = s.exit_time
    ? (s.duration_minutes ?? dayjs(s.exit_time).diff(dayjs(s.entry_time), 'minute'))
    : now.diff(dayjs(s.entry_time), 'minute');
  const overstay = live && minutes >= OVERSTAY_MINUTES;
  const charge = s.calculated_charge == null ? null : Number(s.calculated_charge);
  const owed = s.status === 'COMPLETED' && (charge ?? 0) > 0;
  const payment = paymentLabel(s);

  const undiscounted = Number(s.undiscounted_charge ?? 0);
  const discount = Number(s.discount_value ?? 0);
  const stampMinutes = s.total_stamp_minutes ?? 0;

  const moments: Moment[] = [
    {
      key: 'in',
      title: 'Entered',
      detail: s.registered_staff_member ? `Registered to ${s.registered_staff_member}` : undefined,
      time: at(s.entry_time),
      day: on(s.entry_time, now),
      tone: 'start',
    },
    ...(s.stamps ?? []).map((st) => ({
      key: `stamp-${st.id}`,
      title: `Stamped by ${st.vendor}`,
      detail: `${formatDuration(st.free_minutes_granted)} free`,
      time: at(st.stamped_at),
      day: on(st.stamped_at, now),
      tone: 'mid' as const,
    })),
    s.exit_time
      ? {
          key: 'out',
          title: s.auto_closed ? 'Auto-closed' : s.lost_ticket ? 'Exited · lost ticket' : 'Exited',
          detail: s.auto_closed ? 'Closed by the overnight sweep, not at the gate' : undefined,
          time: at(s.exit_time),
          day: on(s.exit_time, now),
          tone: 'end' as const,
        }
      : {
          key: 'now',
          title: 'Still parked',
          detail: overstay ? 'Over 12 hours — check whether the exit was missed' : `For ${formatDuration(minutes)} so far`,
          tone: 'live' as const,
        },
  ];

  const actions = live ? (
    <Button variant="outline" disabled={busy} onClick={handleClose}>
      Close session
    </Button>
  ) : owed ? (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={busy} className={buttonVariants({ variant: 'default' })}>
        Collect {formatAmount(charge)}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => handlePaid('CASH')}>Paid in cash</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePaid('ONLINE_PAYMENT')}>Paid online</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <PageShell title={`Ticket ${s.ticket_number}`}>
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        {back}

        {/* Identity first: the plate is what the operator is matching against the car. */}
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                {createElement(vehicleIconFor(s.vehicle_type), { className: 'h-5 w-5' })}
              </span>
              <div className="flex min-w-0 flex-col items-start gap-2">
                <Plate value={s.license_plate} size="lg" />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                  <span>{s.vehicle_type}</span>
                  <span className="tabular-nums">#{s.ticket_number}</span>
                  <StatusLabel status={s.status} />
                </div>
              </div>
            </div>
            {actions && <div className="flex shrink-0 gap-2 [&>*]:w-full sm:[&>*]:w-auto">{actions}</div>}
          </div>

          <div className="grid grid-cols-1 gap-px border-t border-border bg-border min-[420px]:grid-cols-3">
            <Stat
              label={live ? 'Parked for' : 'Stayed'}
              value={s.auto_closed ? '—' : formatDuration(minutes)}
              tone={overstay ? 'warn' : undefined}
              hint={live ? `Since ${at(s.entry_time)}` : s.exit_time ? `${at(s.entry_time)} → ${at(s.exit_time)}` : undefined}
            />
            <Stat
              label={owed ? 'Due' : 'Charge'}
              value={charge != null ? formatAmount(charge) : '—'}
              tone={owed ? 'danger' : undefined}
              hint={live ? 'Calculated at exit' : discount > 0 ? `${formatAmount(discount)} off` : undefined}
            />
            <Stat label="Payment" value={payment === '—' ? (live ? 'Pending' : '—') : payment} hint={s.applied_pass ?? undefined} />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card title="Timeline" className="lg:col-span-3">
            <Timeline moments={moments} />
          </Card>

          <Card title="Charges" className="lg:col-span-2">
            <dl className="pb-1">
              {live ? (
                <Row label="Status" tone="muted">
                  Worked out when the vehicle exits
                </Row>
              ) : (
                <>
                  {undiscounted > 0 && <Row label="Parking fee">{formatAmount(undiscounted)}</Row>}
                  {discount > 0 && <Row label={s.applied_coupon ? `Coupon ${s.applied_coupon}` : 'Discount'}>− {formatAmount(discount)}</Row>}
                  {stampMinutes > 0 && <Row label="Stamped free time">{formatDuration(stampMinutes)}</Row>}
                  {s.tenant_bill && (
                    <Row label={`Billed to ${s.tenant_bill.vendor}`}>{formatAmount(s.tenant_bill.amount)}</Row>
                  )}
                  {s.lost_ticket && <Row label="Lost ticket">Flat fine</Row>}
                  <Row label="Total" tone="strong">
                    {charge != null ? formatAmount(charge) : '—'}
                  </Row>
                </>
              )}
            </dl>
            {s.student_billing?.message && (
              <p className="mx-4 mb-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground sm:mx-5">
                {s.student_billing.message}
              </p>
            )}
          </Card>
        </div>

        <Card title="Details">
          <dl className="grid pb-1 md:grid-cols-2 md:[&>div:nth-child(2)]:border-t-0">
            <Row label="Ticket">{s.ticket_number}</Row>
            <Row label="Vehicle type">{s.vehicle_type}</Row>
            <Row label="Plate">{s.license_plate || '—'}</Row>
            <Row label="Registered to">{s.registered_staff_member || 'Visitor'}</Row>
            {s.applied_pass && <Row label="Pass">{s.applied_pass}</Row>}
            {s.student && <Row label="Student">{`${s.student.name} · ${s.student.vendor}`}</Row>}
            <Row label="Entry">
              {dayjs(s.entry_time).format('D MMM YYYY, HH:mm')}
            </Row>
            <Row label="Exit">{s.exit_time ? dayjs(s.exit_time).format('D MMM YYYY, HH:mm') : '—'}</Row>
          </dl>
          {s.notes?.trim() && (
            <p className="border-t border-border/60 px-4 py-3 text-[13px] whitespace-pre-line text-foreground sm:px-5">
              <span className="mb-1 block text-xs text-muted-foreground">Notes</span>
              {s.notes}
            </p>
          )}
        </Card>
      </div>
    </PageShell>
  );
};

export default SessionDetailPage;
