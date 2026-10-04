import { forwardRef, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Car,
  ChevronRight,
  CircleCheck,
  CircleX,
  History,
  Keyboard,
  Loader2,
  Motorbike,
  Nfc,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useLazyRfidLookupQuery } from '@/app/(public)/(pages)/home/_redux/api';
import { PageShell } from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UNASSIGNED_KEY } from '@/components/tenants/types';
import { rejectCard } from '@/components/tenants/cardMotion';
import useRfidReader from '@/hooks/common/useRfidReader';
import { useAppSelector } from '@/lib/public/hooks';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';
import { isAdminOrAbove } from '@/lib/public/roles';
import { formatDate, formatTime } from '@/functions/dateFn';
import { cn } from '@/lib/utils';

interface FoundCard {
  found: true;
  uid: string;
  card: { id: number; is_active: boolean; issued_at: string; last_used: string | null; other_cards: number };
  tenant: {
    id: number;
    name: string;
    email: string | null;
    company: string | null;
    company_id: number | null;
    gate_access_allowed: boolean;
    license_plate: string;
    vehicle_type: string | null;
    vehicle_category: 'CAR' | 'BIKE' | null;
  };
  subscription: { active: boolean; valid_until: string | null };
  parked_since: string | null;
}

type LookupResult = FoundCard | { found: false; uid: string };

interface Identified {
  // Bumped per lookup so the card re-mounts and replays its entrance even
  // when the same card is tapped twice.
  key: number;
  result: LookupResult;
}

type Tone = 'good' | 'warn' | 'bad' | 'plain';

const RECENT_LIMIT = 6;

const TONE_DOT: Record<Tone, string> = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  plain: 'bg-muted-foreground/40',
};

const whenLabel = (iso: string) =>
  dayjs(iso).isSame(dayjs(), 'day') ? `Today, ${formatTime(iso)}` : `${formatDate(iso)}, ${formatTime(iso)}`;

// The same order the gate checks in (rfid._entry_denied), so this answers
// "would this card open the barrier right now?".
const gateVerdict = (r: FoundCard): { label: string; tone: Tone } => {
  if (!r.card.is_active) return { label: 'Card blocked', tone: 'bad' };
  if (!r.tenant.gate_access_allowed) return { label: 'Tenant access revoked', tone: 'bad' };
  if (!r.subscription.active) return { label: 'No active subscription', tone: 'warn' };
  return { label: 'Will open', tone: 'good' };
};

// Tap any card on the booth reader to see who holds it. Read-only: nothing is
// logged and no session opens or closes — the gate itself lives on the home
// screen, which is the only other place the reader is listened to.
const IdentifyCardPage = () => {
  const navigate = useNavigate();
  const canSeeBackOffice = isAdminOrAbove(useAppSelector(loginSelector));
  const [lookup] = useLazyRfidLookupQuery();

  const [current, setCurrent] = useState<Identified | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<LookupResult[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualUid, setManualUid] = useState('');
  const requestSeq = useRef(0);
  const faceRef = useRef<HTMLDivElement>(null);

  const identify = useCallback(
    async (raw: string) => {
      const uid = raw.trim();
      if (!uid) return;
      const seq = ++requestSeq.current;
      setPending(uid);
      setError(null);
      try {
        const result = (await lookup(uid).unwrap()) as LookupResult;
        // A second tap overtook this one; only the latest card is shown.
        if (seq !== requestSeq.current) return;
        setCurrent({ key: seq, result });
        setRecent((prev) => [result, ...prev.filter((r) => r.uid !== result.uid)].slice(0, RECENT_LIMIT));
      } catch {
        if (seq === requestSeq.current) setError(`Couldn't look up card ${uid}. Check the connection and tap again.`);
      } finally {
        if (seq === requestSeq.current) setPending(null);
      }
    },
    [lookup]
  );

  useRfidReader((uid) => void identify(uid));

  // Arriving from Card taps (?uid=…): show that card straight away, then drop
  // the param so a reload or the next tap isn't pinned to it.
  const [params, setParams] = useSearchParams();
  const linkedUid = params.get('uid');
  useEffect(() => {
    if (!linkedUid) return;
    void identify(linkedUid);
    setParams({}, { replace: true });
  }, [linkedUid, identify, setParams]);

  // A found card's entrance is its feedback; an unassigned one shakes its head.
  const shownKey = current?.key ?? null;
  const shownFound = current?.result.found ?? null;
  useEffect(() => {
    if (shownKey !== null && shownFound === false) rejectCard(faceRef.current);
  }, [shownKey, shownFound]);

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    void identify(manualUid);
    setManualUid('');
  };

  const result = current?.result ?? null;

  return (
    <PageShell title="Identify card">
      <div className="mx-auto w-full max-w-5xl pb-10">
        <header className="pt-1 pb-6 text-center lg:pb-8">
          <h2 className="text-[28px] leading-[1.1] font-semibold tracking-[-0.02em] text-foreground">Whose card is this?</h2>
          <p className="mt-2 text-[15px] leading-normal text-muted-foreground">
            Hold any card to the reader. Nothing is recorded at the gate.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
          {/* The card and its answer stay in view while the details scroll. */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
            <div className="relative">
              {result ? (
                <div key={current!.key} className={result.found ? 'identify-in' : 'identify-swap'}>
                  <CardFace ref={faceRef} result={result} />
                </div>
              ) : (
                <ReadyFace />
              )}
              {pending && (
                <div className="identify-wait absolute inset-0 flex items-center justify-center rounded-[22px] bg-background/60 backdrop-blur-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {result?.found && <Verdict key={current!.key} result={result} />}

            {error && (
              <p
                role="alert"
                className="rounded-2xl bg-red-500/10 px-4 py-3 text-center text-sm text-red-700 dark:text-red-300"
              >
                {error}
              </p>
            )}

            {manualOpen ? (
              <form onSubmit={submitManual} className="flex w-full gap-2">
                <Input
                  autoFocus
                  inputMode="numeric"
                  value={manualUid}
                  onChange={(e) => setManualUid(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setManualOpen(false)}
                  placeholder="Card number, e.g. 0012345678"
                  className="h-11 rounded-xl font-mono tabular-nums"
                />
                <Button type="submit" className="h-11 rounded-xl px-5" disabled={!manualUid.trim()}>
                  Find
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                className="mx-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-primary transition-[background-color,transform] duration-100 hover:bg-primary/5 active:scale-[0.97] active:bg-primary/10"
              >
                <Keyboard className="h-4 w-4" />
                Type the number instead
              </button>
            )}
          </div>

          <div className="flex flex-col gap-6">
            {result?.found && (
              <div key={current!.key} className="identify-swap flex flex-col gap-6">
                <Group title="Details">
                  <Details result={result} />
                </Group>
                <Group>
                  <ul className="divide-y divide-border">
                    <li>
                      <LinkRow
                        icon={History}
                        label="See this card's taps"
                        onClick={() => navigate(`/card-taps?uid=${encodeURIComponent(result.uid)}`)}
                      />
                    </li>
                    {canSeeBackOffice && (
                      <li>
                        <LinkRow
                          icon={UserRound}
                          label="Open member"
                          onClick={() =>
                            navigate(
                              `/tenants?tenant=${encodeURIComponent(String(result.tenant.company_id ?? UNASSIGNED_KEY))}&member=${result.tenant.id}`
                            )
                          }
                        />
                      </li>
                    )}
                  </ul>
                </Group>
              </div>
            )}

            {result && !result.found && (
              <div key={current!.key} className="identify-swap rounded-2xl bg-card px-5 py-4 ring-1 ring-border">
                <p className="text-[15px] font-semibold text-foreground">Not issued to anyone</p>
                <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                  The gate won't open for this card.
                  {canSeeBackOffice && ' To assign it, open a member on the Tenants page and tap it there.'}
                </p>
              </div>
            )}

            {recent.length > 0 ? (
              <Group title="Identified just now">
                <ul className="divide-y divide-border">
                  {recent.map((r) => (
                    <li key={r.uid}>
                      <button
                        type="button"
                        onClick={() => void identify(r.uid)}
                        aria-current={r.uid === result?.uid || undefined}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-100 hover:bg-muted/50 active:bg-muted aria-[current]:bg-muted/60"
                      >
                        <span
                          className={cn('h-2 w-2 shrink-0 rounded-full', r.found ? TONE_DOT[gateVerdict(r).tone] : TONE_DOT.plain)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-foreground">
                            {r.found ? r.tenant.name : 'Unassigned card'}
                          </span>
                          <span className="block truncate text-[13px] text-muted-foreground">
                            {r.found ? [r.tenant.license_plate, r.tenant.company].filter(Boolean).join(' · ') : 'Not issued'}
                          </span>
                        </span>
                        <span className="font-mono text-[12.5px] text-muted-foreground tabular-nums">{r.uid}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Group>
            ) : (
              <div className="hidden flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-6 py-12 text-center lg:flex">
                <History className="h-5 w-5 text-muted-foreground/70" />
                <p className="text-[15px] font-medium text-foreground">Nothing read yet</p>
                <p className="max-w-[16rem] text-[13px] leading-relaxed text-muted-foreground">
                  Who holds the card, whether the gate will open and the cards you've checked appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
};

// An inset grouped list, Settings-style: a quiet caption over a single surface.
function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section>
      {title && (
        <h3 className="mb-2 px-4 text-[12px] font-medium tracking-[0.04em] text-muted-foreground uppercase">{title}</h3>
      )}
      <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">{children}</div>
    </section>
  );
}

function LinkRow({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-medium text-foreground transition-colors duration-100 hover:bg-muted/50 active:bg-muted"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
    </button>
  );
}

const VERDICT_STYLE: Record<Tone, { box: string; icon: LucideIcon }> = {
  good: { box: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300', icon: CircleCheck },
  warn: { box: 'bg-amber-500/12 text-amber-900 dark:text-amber-300', icon: TriangleAlert },
  bad: { box: 'bg-red-500/10 text-red-800 dark:text-red-300', icon: CircleX },
  plain: { box: 'bg-muted text-foreground', icon: CircleCheck },
};

// The one question this page exists to answer, said right under the card.
function Verdict({ result }: { result: FoundCard }) {
  const { label, tone } = gateVerdict(result);
  const { box, icon: Icon } = VERDICT_STYLE[tone];
  return (
    <div role="status" className={cn('identify-follow flex items-center gap-3 rounded-2xl px-4 py-3.5', box)}>
      <Icon className="h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[15px] leading-tight font-semibold">
          {tone === 'good' ? 'The gate will open' : "The gate won't open"}
        </p>
        <p className="mt-0.5 text-[13px] opacity-80">
          {tone === 'good'
            ? result.parked_since
              ? `Parked since ${whenLabel(result.parked_since)}`
              : 'Active card and subscription'
            : label}
        </p>
      </div>
    </div>
  );
}

// Waiting for a tap: a blank card outline with the reader glyph breathing.
function ReadyFace() {
  return (
    <div className="flex aspect-[1.586] w-full flex-col items-center justify-center gap-5 rounded-[22px] border-2 border-dashed border-border bg-card/60">
      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <span className="listen-ring motion-reduce:hidden" />
        <span className="listen-ring motion-reduce:hidden [animation-delay:1100ms]" />
        <Nfc className="h-7 w-7" />
      </span>
      <div className="text-center">
        <p className="text-[17px] font-semibold text-foreground">Ready to read</p>
        <p className="mt-0.5 text-sm text-muted-foreground">Tap a card on the reader</p>
      </div>
    </div>
  );
}

const CardFace = forwardRef<HTMLDivElement, { result: LookupResult }>(function CardFace({ result }, ref) {
  if (!result.found) {
    return (
      <div
        ref={ref}
        className="relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-[22px] border border-border bg-muted p-5 text-foreground shadow-sm sm:p-6"
      >
        <span className="text-xs font-medium text-muted-foreground">RFID card</span>
        <div>
          <p className="text-[24px] leading-tight font-semibold tracking-tight">Unassigned card</p>
          <p className="mt-1 font-mono text-sm text-muted-foreground tabular-nums">{result.uid}</p>
        </div>
        <span className="text-xs text-muted-foreground">Not issued to any tenant member</span>
      </div>
    );
  }

  const blocked = !result.card.is_active;
  const VehicleIcon = result.tenant.vehicle_category === 'BIKE' ? Motorbike : Car;

  return (
    <div
      ref={ref}
      className={cn(
        'relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-[22px] bg-primary p-5 text-white shadow-xl shadow-primary/20 sm:p-6 dark:bg-accent dark:ring-1 dark:ring-primary/40',
        blocked && 'grayscale-[0.8]'
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/15 via-transparent to-black/35" />
      <div className="pointer-events-none absolute -top-16 -right-12 h-44 w-44 rounded-full bg-white/10" />

      <div className="relative flex items-center justify-between">
        <span className="text-xs font-medium text-white/75">{result.tenant.company ?? 'Tenant card'}</span>
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
            blocked ? 'bg-red-500/90 text-white' : 'bg-white/20 text-white'
          )}
        >
          {blocked ? 'Blocked' : 'Active'}
        </span>
      </div>

      <div className="relative">
        <p className="truncate text-[26px] leading-tight font-bold tracking-tight sm:text-[30px]">{result.tenant.name}</p>
        {/* Exactly as the reader types it: leading zeros matter. */}
        <p className="mt-1 font-mono text-sm text-white/80 tabular-nums">{result.uid}</p>
      </div>

      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-white/65">Vehicle</p>
          <p className="truncate font-mono text-sm font-semibold tabular-nums">{result.tenant.license_plate}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15">
          <VehicleIcon className="h-4.5 w-4.5" />
        </span>
      </div>
    </div>
  );
});

function Details({ result }: { result: FoundCard }) {
  const rows: { label: string; value: string; tone?: Tone }[] = [
    {
      label: 'Subscription',
      value: result.subscription.valid_until ? `Until ${formatDate(result.subscription.valid_until)}` : 'None',
      tone: result.subscription.active ? 'good' : 'warn',
    },
    {
      label: 'Right now',
      value: result.parked_since ? `Parked since ${whenLabel(result.parked_since)}` : 'Not parked',
      tone: result.parked_since ? 'good' : 'plain',
    },
    { label: 'Vehicle type', value: result.tenant.vehicle_type ?? '—' },
    { label: 'Last used', value: result.card.last_used ? whenLabel(result.card.last_used) : 'Never' },
    { label: 'Issued', value: formatDate(result.card.issued_at) },
  ];
  if (result.card.other_cards > 0) {
    rows.push({
      label: 'Other cards',
      value: `${result.card.other_cards} more issued to this member`,
    });
  }

  return (
    <dl className="divide-y divide-border">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="shrink-0 text-[15px] text-muted-foreground">{row.label}</dt>
          <dd className="flex min-w-0 items-center gap-2 text-right text-[15px] font-medium text-foreground">
            {row.tone && row.tone !== 'plain' && <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT[row.tone])} />}
            <span className="truncate">{row.value}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default IdentifyCardPage;
