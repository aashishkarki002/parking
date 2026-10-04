import { useEffect, useMemo, useRef, useState, type ComponentType, type SVGProps } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  TicketIcon,
  UserIcon,
  BuildingOffice2Icon,
  DocumentTextIcon,
  TagIcon,
  TruckIcon,
  UserGroupIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/lib/public/hooks';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';
import { isAdminOrAbove } from '@/lib/public/roles';
import {
  useGlobalSearchQuery,
  type GlobalSearchResult,
  type GlobalSearchType,
} from '@/app/(public)/(pages)/home/_redux/api';
import { UNASSIGNED_KEY } from '@/components/tenants/types';

const MIN_LENGTH = 2;
const DEBOUNCE_MS = 300;
const RECENT_KEY = 'global-search:recent';
const RECENT_MAX = 5;

// Display order of groups in the palette — mirrors the sidebar's order.
const GROUPS: { type: GlobalSearchType; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { type: 'session', label: 'Sessions', icon: TicketIcon },
  { type: 'member', label: 'Members & vehicles', icon: UserIcon },
  { type: 'tenant', label: 'Tenants', icon: BuildingOffice2Icon },
  { type: 'pass', label: 'Monthly passes', icon: DocumentTextIcon },
  { type: 'pricing_plan', label: 'Pricing plans', icon: TagIcon },
  { type: 'vehicle_type', label: 'Vehicle types', icon: TruckIcon },
  { type: 'operator', label: 'Operators', icon: UserGroupIcon },
];

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function writeRecent(terms: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(terms));
  } catch {
    // Storage blocked (private mode etc.) — recents are a convenience only.
  }
}

function Highlight({ text, term }: { text: string; term: string }) {
  const index = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/30">
        {text.slice(index, index + term.length)}
      </mark>
      {text.slice(index + term.length)}
    </>
  );
}

// ⌘K / Ctrl+K palette mounted in PageShell's header. Queries
// GET /parking/search (role-trimmed server side) and routes each hit to the
// page that already knows how to show it via its URL params.
export function GlobalSearch() {
  const navigate = useNavigate();
  const loginState = useAppSelector(loginSelector);
  const canSeeBackOffice = isAdminOrAbove(loginState);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const typing =
          target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
        if (!typing) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      setTerm(input.trim());
      setActive(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [input]);

  const skip = !open || term.length < MIN_LENGTH;
  const { data, isFetching, isError } = useGlobalSearchQuery(term, { skip });
  // Ignore a stale response for an older term while the next one is in flight.
  const results = useMemo<GlobalSearchResult[]>(
    () => (!skip && data?.q === term ? data.results : []),
    [skip, data, term]
  );

  const grouped = useMemo(
    () =>
      GROUPS.map((g) => ({ ...g, items: results.filter((r) => r.type === g.type) })).filter(
        (g) => g.items.length > 0
      ),
    [results]
  );
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setInput('');
      setTerm('');
    }
  };

  const routeFor = (r: GlobalSearchResult): string => {
    const plate = r.meta.license_plate ?? '';
    switch (r.type) {
      case 'session':
        return `/sessions?search=${encodeURIComponent(r.meta.ticket_number ?? plate)}`;
      case 'member': {
        // /tenants is back-office only; the gate desk gets that plate's sessions.
        if (!canSeeBackOffice) return `/sessions?search=${encodeURIComponent(plate)}`;
        const tenant = r.meta.vendor_id != null ? String(r.meta.vendor_id) : UNASSIGNED_KEY;
        return `/tenants?tenant=${encodeURIComponent(tenant)}&member=${encodeURIComponent(r.id)}`;
      }
      case 'tenant':
        return canSeeBackOffice ? `/tenants?tenant=${encodeURIComponent(r.id)}` : '/tenant-gate-today';
      case 'pass':
        return `/subscription?search=${encodeURIComponent(plate)}`;
      case 'pricing_plan':
        return '/pricing-plans';
      case 'vehicle_type':
        return '/vehicle-types';
      case 'operator':
        return '/operators';
    }
  };

  const select = (r: GlobalSearchResult) => {
    const nextRecent = [term, ...recent.filter((t) => t.toLowerCase() !== term.toLowerCase())].slice(
      0,
      RECENT_MAX
    );
    setRecent(nextRecent);
    writeRecent(nextRecent);
    handleOpenChange(false);
    navigate(routeFor(r));
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flat.length) setActive((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length) setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault();
      select(flat[active]);
    }
  };

  const showRecent = input.trim().length < MIN_LENGTH;
  const waiting = !showRecent && (input.trim() !== term || (isFetching && results.length === 0));

  let index = -1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:w-64"
      >
        <MagnifyingGlassIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">Search plates, tickets, tenants…</span>
        <kbd className="hidden rounded border border-border bg-background px-1.5 font-mono text-[10px] sm:inline">
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent showCloseButton={false} initialFocus={inputRef} className="max-w-xl overflow-hidden transition-none data-starting-style:scale-100 data-starting-style:opacity-100 data-ending-style:scale-100 data-ending-style:opacity-100">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search plates, tickets, tenants, members, RFID…"
              className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              role="combobox"
              aria-expanded={flat.length > 0}
              aria-controls="global-search-results"
              aria-activedescendant={flat[active] ? `global-search-${active}` : undefined}
            />
            <kbd className="rounded border border-border px-1.5 font-mono text-[10px] text-muted-foreground">Esc</kbd>
          </div>

          <div ref={listRef} id="global-search-results" role="listbox" className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
            {showRecent ? (
              recent.length > 0 ? (
                <div>
                  <p className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">
                    Recent
                  </p>
                  {recent.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setInput(t);
                        inputRef.current?.focus();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm text-foreground hover:bg-muted"
                    >
                      <ClockIcon className="h-4 w-4 text-muted-foreground" />
                      {t}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                  Type at least {MIN_LENGTH} characters to search.
                </p>
              )
            ) : isError ? (
              <p className="px-2 py-8 text-center text-sm text-destructive">Search failed. Try again.</p>
            ) : waiting ? (
              <div className="space-y-2 p-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : flat.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                No matches for “{term}”.
              </p>
            ) : (
              grouped.map((g) => (
                <div key={g.type} className="pb-1">
                  <p className="px-2 pb-1 pt-2 text-xs text-muted-foreground">
                    {g.label}
                  </p>
                  {g.items.map((r) => {
                    index += 1;
                    const i = index;
                    const Icon = g.icon;
                    return (
                      <button
                        key={`${r.type}-${r.id}`}
                        id={`global-search-${i}`}
                        data-index={i}
                        type="button"
                        role="option"
                        aria-selected={i === active}
                        onMouseMove={() => setActive(i)}
                        onClick={() => select(r)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left',
                          i === active ? 'bg-muted' : 'hover:bg-muted/60'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            <Highlight text={r.title} term={term} />
                          </span>
                          {r.subtitle && (
                            <span className="block truncate text-xs text-muted-foreground">
                              <Highlight text={r.subtitle} term={term} />
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
