import { forwardRef, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowUpRight, Motorbike, Car, Keyboard, Loader2, Nfc } from 'lucide-react';
import { useLazyRfidLookupQuery } from '@/app/(public)/(pages)/home/_redux/api';
import { PageShell } from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UNASSIGNED_KEY } from '@/components/tenants/types';
import { pressCard, rejectCard } from '@/components/tenants/cardMotion';
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

  const shownKey = current?.key ?? null;
  const shownFound = current?.result.found ?? null;
  useEffect(() => {
    if (shownKey === null) return;
    if (shownFound) pressCard(faceRef.current);
    else rejectCard(faceRef.current);
  }, [shownKey, shownFound]);

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    void identify(manualUid);
    setManualUid('');
  };

  const result = current?.result ?? null;

  return (
    <PageShell title="Identify card">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 pb-10">
        <header className="pt-2 text-center">
          <h2 className="text-[26px] leading-tight font-semibold tracking-tight text-foreground">Whose card is this?</h2>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Hold any card to the reader. Nothing is recorded at the gate.
          </p>
        </header>

        <div className="relative">
          {result ? (
            <div key={current!.key} className="identify-in">
              <CardFace ref={faceRef} result={result} tapKey={current!.key} />
            </div>
          ) : (
            <ReadyFace />
          )}
          {pending && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[22px] bg-background/60 backdrop-blur-sm">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-center text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        {result?.found && (
          <>
            <Details result={result} />
            {canSeeBackOffice && (
              <Button
                size="lg"
                variant="outline"
                className="h-12 rounded-2xl text-[15px]"
                onClick={() =>
                  navigate(
                    `/tenants?tenant=${encodeURIComponent(String(result.tenant.company_id ?? UNASSIGNED_KEY))}&member=${result.tenant.id}`
                  )
                }
              >
                Open member
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            )}
          </>
        )}

        {result && !result.found && (
          <p className="text-center text-[15px] text-muted-foreground">
            This card isn't issued to anyone yet.
            {canSeeBackOffice && ' Open a member on the Tenants page and tap it there to assign it.'}
          </p>
        )}

        {recent.length > 1 && (
          <section>
            <h3 className="mb-2 px-4 text-[13px] font-medium text-muted-foreground uppercase">Identified just now</h3>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {recent.map((r) => (
                <li key={r.uid}>
                  <button
                    type="button"
                    onClick={() => void identify(r.uid)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60',
                      r.uid === result?.uid && 'bg-muted/60'
                    )}
                  >
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', r.found ? TONE_DOT[gateVerdict(r).tone] : TONE_DOT.plain)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-foreground">
                        {r.found ? r.tenant.name : 'Unassigned card'}
                      </span>
                      <span className="block truncate text-[12.5px] text-muted-foreground">
                        {r.found ? [r.tenant.license_plate, r.tenant.company].filter(Boolean).join(' · ') : 'Not issued'}
                      </span>
                    </span>
                    <span className="font-mono text-[12.5px] text-muted-foreground tabular-nums">{r.uid}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-col items-center gap-3">
          {manualOpen ? (
            <form onSubmit={submitManual} className="flex w-full gap-2">
              <Input
                autoFocus
                inputMode="numeric"
                value={manualUid}
                onChange={(e) => setManualUid(e.target.value)}
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
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Keyboard className="h-4 w-4" />
              Type the number instead
            </button>
          )}
        </div>
      </div>
    </PageShell>
  );
};

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

interface CardFaceProps {
  result: LookupResult;
  tapKey: number;
}

const CardFace = forwardRef<HTMLDivElement, CardFaceProps>(function CardFace({ result, tapKey }, ref) {
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
      <div key={tapKey} aria-hidden className="pointer-events-none absolute inset-0">
        <span className="tap-ring" />
        <span className="tap-ring" />
      </div>

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
  const verdict = gateVerdict(result);
  const rows: { label: string; value: string; tone?: Tone }[] = [
    { label: 'At the gate', value: verdict.label, tone: verdict.tone },
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
    <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
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
