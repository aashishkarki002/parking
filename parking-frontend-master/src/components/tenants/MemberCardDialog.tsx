import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import { Motorbike, Car, CalendarClock, Copy, Eye, EyeOff, Nfc, Pencil, Plus, Power, ReceiptText } from 'lucide-react';
import {
  useGetSessionsTableQuery,
  useUpdateRfidCardMutation,
} from '@/app/(public)/(pages)/home/_redux/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDate, formatDuration, formatTime } from '@/functions/dateFn';
import useRfidReader from '@/hooks/common/useRfidReader';
import { AddCardPanel } from '@/components/tenants/AddCardPanel';
import { MemberEditForm } from '@/components/tenants/MemberEditForm';
import { StatusPill } from '@/components/tenants/primitives';
import { UidDisplay } from '@/components/tenants/UidDisplay';
import { pressCard, rejectCard } from '@/components/tenants/cardMotion';
import { useAddCard } from '@/components/tenants/useAddCard';
import type { RfidCard, TenantMember, TenantRow } from '@/components/tenants/types';

const RECENT_VISITS = 5;
const EDIT_FORM_ID = 'member-card-edit';
const ADD_FORM_ID = 'member-card-add';
// How long "Card added" stays up before the popup folds back to the card view.
const ADDED_LINGER_MS = 1600;

interface ActionTile {
  label: string;
  icon: typeof Pencil;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger' | 'primary';
}

interface MemberSession {
  id: string;
  license_plate: string | null;
  entry_time: string;
  exit_time: string | null;
  duration_minutes: number | null;
  calculated_charge: string | null;
  payment_method: 'CASH' | 'ONLINE_PAYMENT' | null;
  status: 'ACTIVE' | 'COMPLETED' | 'PAID' | 'WAIVED' | 'COVERED_BY_PASS';
}

interface MemberCardDialogProps {
  member: TenantMember | null;
  row: TenantRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

// Same length as the UID so nothing about it is lost but the digits themselves.
const maskUid = (uid: string) => `${'•'.repeat(Math.max(0, uid.length - 4))}${uid.slice(-4)}`;

// The card the popup shows and acts on: the newest active one (the API returns
// newest first), else the newest of any state, else none. A member can hold
// several cards over time (lost/replaced).
const pickCard = (cards: RfidCard[] | undefined): RfidCard | null =>
  cards?.find((c) => c.is_active) ?? cards?.[0] ?? null;

const relativeDay = (iso: string) => {
  const d = dayjs(iso);
  if (d.isSame(dayjs(), 'day')) return 'Today';
  if (d.isSame(dayjs().subtract(1, 'day'), 'day')) return 'Yesterday';
  return formatDate(iso, 'DD MMM');
};

const sessionAmount = (s: MemberSession) => {
  const n = Number(s.calculated_charge ?? 0);
  return n > 0 ? `Rs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—';
};

const sessionLabel = (s: MemberSession) => {
  if (s.status === 'ACTIVE') return 'Parked now';
  if (s.status === 'COVERED_BY_PASS') return 'Monthly pass';
  if (s.status === 'PAID') return s.payment_method === 'CASH' ? 'Paid · Cash' : 'Paid · Online';
  if (s.status === 'WAIVED') return 'Waived';
  return Number(s.calculated_charge || 0) > 0 ? 'Unpaid' : 'Completed';
};

// Member detail as a centered "wallet card" popup: the RFID gate card up top,
// quick actions, the tenant's quota for this vehicle category, and the
// member's most recent visits (matched on licence plate). Editing and adding a
// card happen in place: the card stays pinned on top and the form replaces the
// sections below. A card is added by tapping it on the booth reader (the card
// face animates the tap) or by typing its number.
export function MemberCardDialog({ member, row, open, onOpenChange, onChanged }: MemberCardDialogProps) {
  const navigate = useNavigate();
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  // The capture whose number has been shown once already, so hiding and
  // re-showing it doesn't replay the roll.
  const [settledCapture, setSettledCapture] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const faceRef = useRef<HTMLDivElement>(null);
  const handleSubmittingChange = useCallback((value: boolean) => setSaving(value), []);
  // Only this member's latest few visits, matched server-side by plate.
  const { data: sessionsData, isLoading: sessionsLoading } = useGetSessionsTableQuery(
    { plate: member?.license_plate ?? '', page_size: RECENT_VISITS },
    { skip: !open || !member?.license_plate }
  );
  const [updateRfidCard, { isLoading: toggling }] = useUpdateRfidCardMutation();
  const { phase, capture, error, refusals, submit, reset } = useAddCard(member?.id, () => {
    // Keep the number in view once it is on the card: it was just entered.
    setRevealed(true);
    onChanged();
  });

  // The reader is a keyboard wedge, so it is only listened to while the add
  // screen is open and free to take a card — anywhere else its keystrokes
  // must stay ordinary typing.
  useRfidReader(
    (uid) => {
      void submit(uid, 'tap');
    },
    open && adding && (phase === 'listening' || phase === 'error')
  );

  const tapId = capture?.source === 'tap' ? capture.id : null;
  useEffect(() => {
    if (tapId !== null) pressCard(faceRef.current);
  }, [tapId]);

  useEffect(() => {
    if (refusals > 0) rejectCard(faceRef.current);
  }, [refusals]);

  useEffect(() => {
    if (phase !== 'added') return undefined;
    const timer = setTimeout(() => setAdding(false), ADDED_LINGER_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const visits = useMemo(() => {
    if (!member) return [];
    return (sessionsData?.results ?? []) as MemberSession[];
  }, [sessionsData, member]);

  if (!member) return null;

  const cards = member.rfid_cards ?? [];
  const card = pickCard(cards);
  const cardActive = card?.is_active ?? false;
  const otherCards = cards.filter((c) => c.id !== card?.id);
  const cardLabel = adding
    ? 'Tenant card · New RFID card'
    : ['Tenant card', !card ? 'No RFID card' : !card.is_active ? 'Inactive' : null, cards.length > 1 ? `${cards.length} issued` : null]
        .filter(Boolean)
        .join(' · ');

  // While adding, the face shows the card being read; otherwise the member's
  // current card. The digits roll in only for a tap, and that same element is
  // kept once the add screen closes so a finished roll is never replayed.
  const shownUid = adding && capture ? capture.uid : (card?.uid ?? null);
  const digitsVisible = revealed || (adding && capture !== null);
  const rolledId = capture?.source === 'tap' && capture.uid === shownUid ? capture.id : null;
  const rolling = rolledId !== null && rolledId !== settledCapture;

  const isBike = member.category === 'BIKE';
  const VehicleIcon = isBike ? Motorbike : Car;
  const used = isBike ? row.bikesUsed : row.carsUsed;
  const quota = isBike ? row.bikeQuota : row.carQuota;
  const ratio = quota > 0 ? Math.min(1, used / quota) : 0;
  const over = quota > 0 && used > quota;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setRevealed(false);
      setEditing(false);
      setAdding(false);
      setSettledCapture(null);
      reset();
    }
    onOpenChange(next);
  };

  const startAdding = () => {
    reset();
    setSettledCapture(null);
    setAdding(true);
  };

  const cancelAdding = () => {
    setAdding(false);
    reset();
  };

  const copyUid = async () => {
    if (!card) {
      toast.info('This member has no RFID card yet');
      return;
    }
    try {
      await navigator.clipboard.writeText(card.uid);
      toast.success('Card UID copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  // The gate only admits RFIDCard.is_active, so this flips the card itself —
  // not Staff.is_card_active, which the RFID tap never reads.
  const toggleCard = async (target: RfidCard) => {
    try {
      await updateRfidCard({ id: target.id, is_active: !target.is_active }).unwrap();
      toast.success(target.is_active ? 'Card deactivated' : 'Card reactivated');
      onChanged();
    } catch {
      // interceptor handles the error toast
    }
  };

  const edit: ActionTile = { label: 'Edit', icon: Pencil, onClick: () => setEditing(true) };
  const passes: ActionTile = { label: 'Passes', icon: CalendarClock, onClick: () => navigate('/subscription') };
  // Without a card, the one thing worth doing is adding it, so it takes the
  // place of the card-only actions instead of leaving them greyed out.
  const actions: ActionTile[] = card
    ? [
        edit,
        {
          label: cardActive ? 'Deactivate' : 'Activate',
          icon: Power,
          onClick: () => void toggleCard(card),
          disabled: toggling,
          tone: cardActive ? 'danger' : undefined,
        },
        { label: 'Copy UID', icon: Copy, onClick: copyUid },
        passes,
      ]
    : [edit, { label: 'Add card', icon: Nfc, onClick: startAdding, tone: 'primary' }, passes];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Height-capped with an inner scroll area: a flex-centered viewport would
          otherwise clip the top of the card on short screens (landscape phones). */}
      <DialogContent
        viewportClassName="items-center p-3 sm:p-6"
        className="max-h-[calc(100dvh-1.5rem)] max-w-md overflow-hidden bg-background sm:max-h-[calc(100dvh-3rem)]"
      >
        <DialogHeader className="shrink-0 border-0 px-4 pb-2 sm:px-5">
          <DialogTitle>{editing ? 'Edit vehicle' : adding ? 'Add RFID card' : 'Parking card'}</DialogTitle>
          <DialogDescription>{row.name}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4 sm:gap-4 sm:px-5 sm:pb-5">
          {/* Card, with a second layer peeking out behind it like a wallet stack. */}
          <div className="relative pt-2">
            <div className="absolute inset-x-3 top-0 h-8 rounded-t-xl bg-primary/35 dark:bg-primary/25" />
            <div
              ref={faceRef}
              className={cn(
                'relative overflow-hidden rounded-xl bg-primary p-4 text-white sm:p-5 shadow-lg dark:bg-accent dark:ring-1 dark:ring-primary/40',
                !cardActive && !adding && 'grayscale-[0.7]'
              )}
            >
              <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/15 via-transparent to-black/35" />
              <div className="pointer-events-none absolute -top-16 -right-12 h-40 w-40 rounded-full bg-white/10" />
              {/* Rings radiating out of the tap. Re-keyed per tap; stays mounted
                  (invisible) afterwards so closing the add screen can't replay it. */}
              {tapId !== null && (
                <div key={tapId} aria-hidden className="pointer-events-none absolute inset-0">
                  <span className="tap-ring" />
                  <span className="tap-ring" />
                </div>
              )}

              <div className="relative flex flex-col gap-3 sm:gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white/75">{cardLabel}</span>
                  {!adding && !editing && card && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={startAdding}
                        aria-label="Add another RFID card"
                        title="Add another RFID card"
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-white/15 text-white/90 hover:bg-white/25"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRevealed((v) => !v);
                          if (rolledId !== null) setSettledCapture(rolledId);
                        }}
                        aria-label={revealed ? 'Hide card UID' : 'Show card UID'}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-white/15 text-white/90 hover:bg-white/25"
                      >
                        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs text-white/75">Permit valid until</p>
                  <p className="text-[22px] leading-tight font-bold tracking-tight tabular-nums sm:text-[28px]">
                    {member.active_pass_until ? formatDate(member.active_pass_until) : 'No monthly pass'}
                  </p>
                  {shownUid ? (
                    // Shown exactly as the reader types it: leading zeros matter.
                    <p className="mt-1 font-mono text-[13px] text-white/80 tabular-nums sm:text-sm">
                      <UidDisplay
                        key={digitsVisible ? `uid-${rolling ? rolledId : 'still'}` : 'masked'}
                        text={digitsVisible ? shownUid : maskUid(shownUid)}
                        roll={digitsVisible && rolling}
                      />
                    </p>
                  ) : adding ? (
                    // Waiting for a tap: blank cells, breathing.
                    <p className="mt-1 font-mono text-[13px] text-white/60 sm:text-sm motion-safe:animate-pulse">
                      <UidDisplay text={'•'.repeat(10)} />
                    </p>
                  ) : (
                    <p className="mt-1 text-[13px] text-white/80 sm:text-sm">No RFID card issued</p>
                  )}
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div className="flex min-w-0 gap-4 sm:gap-6">
                    <div className="min-w-0">
                      <p className="text-[11px] text-white/65">Card holder</p>
                      <p className="truncate text-sm font-semibold">{member.name}</p>
                    </div>
                    <div className="shrink-0">
                      <p className="text-[11px] text-white/65">Vehicle</p>
                      <p className="font-mono text-sm font-semibold tabular-nums">{member.license_plate}</p>
                    </div>
                  </div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15">
                    <VehicleIcon className="h-4.5 w-4.5" />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {editing ? (
            <MemberEditForm
              formId={EDIT_FORM_ID}
              member={member}
              onSubmittingChange={handleSubmittingChange}
              onSaved={() => {
                setEditing(false);
                onChanged();
              }}
            />
          ) : adding ? (
            <AddCardPanel
              formId={ADD_FORM_ID}
              phase={phase}
              error={error}
              onSubmit={(uid) => void submit(uid, 'manual')}
            />
          ) : (
            <>
              <div className={cn('grid gap-1.5 sm:gap-2', actions.length === 3 ? 'grid-cols-3' : 'grid-cols-4')}>
                {actions.map(({ label, icon: Icon, onClick, disabled, tone }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={onClick}
                    disabled={disabled}
                    className={cn(
                      'flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-1 py-2.5 text-center text-[11px] leading-tight font-medium break-words sm:gap-2 sm:py-3 sm:text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-accent disabled:opacity-50',
                      tone === 'danger' && 'hover:border-red-300 hover:bg-red-50 dark:hover:border-red-900 dark:hover:bg-red-950/30',
                      tone === 'primary' && 'border-primary/40 bg-accent'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4.5 w-4.5 shrink-0 text-primary sm:h-5 sm:w-5',
                        tone === 'danger' && 'text-red-600 dark:text-red-400'
                      )}
                    />
                    {label}
                  </button>
                ))}
              </div>

              {otherCards.length > 0 && (
                <div>
                  <span className="mb-1 block text-sm text-muted-foreground">Other cards</span>
                  <ul>
                    {otherCards.map((c, i) => (
                      <li key={c.id}>
                        {i > 0 && <Separator />}
                        <div className="flex items-center gap-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-sm font-semibold tabular-nums text-foreground">{maskUid(c.uid)}</p>
                            <p className="text-xs text-muted-foreground">Added {formatDate(c.created_at, 'DD MMM')}</p>
                          </div>
                          <StatusPill active={c.is_active} />
                          <button
                            type="button"
                            onClick={() => void toggleCard(c)}
                            disabled={toggling}
                            className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-primary disabled:opacity-50"
                          >
                            {c.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-xl border border-border bg-card p-3.5 sm:p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">{isBike ? 'Bike' : 'Car'} slots used</span>
                  <span className="shrink-0 text-lg font-bold tabular-nums text-foreground">
                    {used}
                    <span className="text-sm font-medium text-muted-foreground">/{quota > 0 ? quota : '—'}</span>
                  </span>
                </div>
                <div className="mt-2 flex h-3 w-full gap-0.5 overflow-hidden rounded-sm">
                  <span
                    className={cn('h-full rounded-sm', over ? 'bg-red-500' : ratio >= 0.9 ? 'bg-amber-500' : 'bg-primary')}
                    style={{ width: `${(over ? 1 : ratio) * 100}%` }}
                  />
                  <span className="h-full flex-1 rounded-sm bg-[repeating-linear-gradient(90deg,var(--color-muted)_0_6px,transparent_6px_8px)]" />
                </div>
                <div className="mt-1.5 flex justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="min-w-0 truncate">
                    {quota > 0
                      ? over
                        ? `${used - quota} over ${row.name}'s quota`
                        : `${Math.round(ratio * 100)}% of ${row.name}'s quota`
                      : 'No quota synced for this tenant'}
                  </span>
                  {quota > 0 && <span className="shrink-0">100%</span>}
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Recent visits</span>
                  <Link
                    to={`/sessions?search=${encodeURIComponent(member.license_plate)}`}
                    className="text-sm font-semibold text-foreground hover:text-primary"
                  >
                    See all
                  </Link>
                </div>

                {sessionsLoading ? (
                  <div className="space-y-2 py-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-11 w-full" />
                    ))}
                  </div>
                ) : visits.length === 0 ? (
                  <div className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted-foreground">
                    <ReceiptText className="h-5 w-5" />
                    No visits recorded for this vehicle yet.
                  </div>
                ) : (
                  <ul>
                    {visits.map((s, i) => {
                      const owes = s.status === 'COMPLETED' && Number(s.calculated_charge || 0) > 0;
                      return (
                        <li key={s.id}>
                          {i > 0 && <Separator />}
                          <div className="flex items-center gap-2.5 py-2.5 sm:gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                              <VehicleIcon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {s.status === 'ACTIVE'
                                  ? 'Parked'
                                  : s.duration_minutes != null
                                    ? `Parked ${formatDuration(s.duration_minutes)}`
                                    : 'Visit'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {relativeDay(s.entry_time)}, {formatTime(s.entry_time)}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p
                                className={cn(
                                  'text-sm font-semibold tabular-nums',
                                  owes ? 'text-red-600 dark:text-red-400' : s.status === 'ACTIVE' ? 'text-primary' : 'text-foreground'
                                )}
                              >
                                {sessionAmount(s)}
                              </p>
                              <p className="text-[11px] text-muted-foreground">{sessionLabel(s)}</p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        {adding && (
          <DialogFooter className="shrink-0 justify-end">
            {phase === 'added' ? (
              <Button type="button" onClick={() => setAdding(false)}>
                Done
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={cancelAdding} disabled={phase === 'saving'}>
                  Cancel
                </Button>
                <Button type="submit" form={ADD_FORM_ID} disabled={phase === 'saving'}>
                  {phase === 'saving' ? 'Adding…' : 'Add card'}
                </Button>
              </>
            )}
          </DialogFooter>
        )}

        {editing && (
          <DialogFooter className="shrink-0 justify-end">
            <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form={EDIT_FORM_ID} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
