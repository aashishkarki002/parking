import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Calendar, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { PRESETS, toISODate, type PresetKey, type ResolvedScope, type Scope } from './scope';

// Smooth settle, no overshoot — the tap carried no momentum of its own, so an
// elastic pill would be inventing physics that the gesture never had.
const PILL_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const PILL_MS = 340;

const QUICK_RANGES: { label: string; build: () => { start: string; end: string } }[] = [
  {
    label: 'Yesterday',
    build: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return { start: toISODate(d), end: toISODate(d) };
    },
  },
  {
    label: 'Last 7 days',
    build: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 6);
      return { start: toISODate(start), end: toISODate(end) };
    },
  },
  {
    label: 'Last 30 days',
    build: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 29);
      return { start: toISODate(start), end: toISODate(end) };
    },
  },
];

interface PeriodScopeBarProps {
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
  resolved: ResolvedScope;
}

/**
 * The dashboard's scope bar: four presets as a segmented control, the window
 * they resolve to spelled out beside them, and a custom-range escape hatch.
 *
 * Sits directly above the figures it governs rather than in the page header —
 * a control belongs next to what it changes, and up there it read as governing
 * the whole page, including the session list it has no say over.
 */
export function PeriodScopeBar({ scope, onScopeChange, resolved }: PeriodScopeBarProps) {
  const isCustom = scope.kind === 'custom';
  const activeIndex = isCustom ? -1 : PRESETS.findIndex((p) => p.key === scope.key);

  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // The pill must not slide in from the origin on first paint — it should just
  // be where it belongs. Animation is only for a change the user caused.
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const list = listRef.current;
      const item = itemRefs.current[activeIndex];
      if (!list || !item) {
        setPill(null);
        return;
      }
      const listBox = list.getBoundingClientRect();
      const itemBox = item.getBoundingClientRect();
      setPill({ left: itemBox.left - listBox.left, width: itemBox.width });
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (listRef.current) observer.observe(listRef.current);
    return () => observer.disconnect();
  }, [activeIndex]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const selectPreset = (key: PresetKey) => onScopeChange({ kind: 'preset', key });

  // Arrow keys move between segments, as a radio group should. Roving tabindex
  // keeps the group a single tab stop.
  const onKeyDown = (event: KeyboardEvent) => {
    const from = activeIndex < 0 ? 0 : activeIndex;
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (from + 1) % PRESETS.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (from - 1 + PRESETS.length) % PRESETS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = PRESETS.length - 1;
    if (next === null) return;
    event.preventDefault();
    selectPreset(PRESETS[next].key);
    itemRefs.current[next]?.focus();
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <div
          ref={listRef}
          role="radiogroup"
          aria-label="Time range"
          onKeyDown={onKeyDown}
          className="relative grid h-8 w-full grid-cols-4 items-center gap-0.5 rounded-full border border-border bg-muted/40 p-0.5 sm:inline-flex sm:w-auto"
        >
          {pill && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 top-0.5 bottom-0.5 rounded-full bg-primary shadow-sm motion-reduce:!transition-none"
              style={{
                transform: `translateX(${pill.left}px)`,
                width: pill.width,
                transition: animate
                  ? `transform ${PILL_MS}ms ${PILL_EASE}, width ${PILL_MS}ms ${PILL_EASE}`
                  : undefined,
              }}
            />
          )}
          {PRESETS.map((preset, i) => {
            const selected = i === activeIndex;
            return (
              <button
                key={preset.key}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected || (activeIndex < 0 && i === 0) ? 0 : -1}
                onClick={() => selectPreset(preset.key)}
                className={cn(
                  'relative z-10 flex h-7 select-none items-center justify-center rounded-full px-3 text-[13px] font-medium leading-none',
                  'transition-[color,transform] duration-100 ease-out active:scale-[0.97] motion-reduce:active:scale-100',
                  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                  selected ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <CustomRangePopover scope={scope} onScopeChange={onScopeChange} />
      </div>

      <p className="min-w-0 text-xs leading-tight text-muted-foreground">
        <span className="font-medium tabular-nums text-foreground/80">{resolved.rangeLabel}</span>
        <span className="mx-1.5 opacity-40">·</span>
        compared with {resolved.comparisonLabel}
      </p>
    </div>
  );
}

function CustomRangePopover({
  scope,
  onScopeChange,
}: {
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = useMemo(() => toISODate(new Date()), []);

  const apply = (next: { start: string; end: string }) => {
    onScopeChange({ kind: 'custom', start: next.start, end: next.end });
    setOpen(false);
  };

  const isCustom = scope.kind === 'custom';
  const seedStart = isCustom ? scope.start : today;
  const seedEnd = isCustom ? scope.end : today;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            // When a custom range is in effect no segment is lit, so this
            // button is the only thing carrying the selection — it wears the
            // same pill as a selected segment rather than a faint tint.
            variant={isCustom ? 'default' : 'outline'}
            size="sm"
            aria-label="Custom date range"
            className="h-8 shrink-0 gap-1.5 rounded-full px-3 text-[13px] font-medium"
          />
        }
      >
        <Calendar className="h-3.5 w-3.5 opacity-70" />
        <span className="hidden sm:inline">Custom</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-[268px] p-3">
        <div className="flex flex-col gap-1">
          {QUICK_RANGES.map((range) => {
            const built = range.build();
            const active = isCustom && scope.start === built.start && scope.end === built.end;
            return (
              <button
                key={range.label}
                type="button"
                onClick={() => apply(built)}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {range.label}
                {active && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
        </div>

        <div className="my-2.5 h-px bg-border" />

        {/* Keyed on the scope in effect, so opening the popover always shows
            the range actually applied — never a half-finished earlier edit. */}
        <CustomRangeFields
          key={`${seedStart}_${seedEnd}`}
          initialStart={seedStart}
          initialEnd={seedEnd}
          today={today}
          onApply={apply}
        />
      </PopoverContent>
    </Popover>
  );
}

function CustomRangeFields({
  initialStart,
  initialEnd,
  today,
  onApply,
}: {
  initialStart: string;
  initialEnd: string;
  today: string;
  onApply: (range: { start: string; end: string }) => void;
}) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const valid = start !== '' && end !== '' && start <= end;

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        From
        <input
          type="date"
          value={start}
          max={end || today}
          onChange={(e) => setStart(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        To
        <input
          type="date"
          value={end}
          min={start}
          max={today}
          onChange={(e) => setEnd(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <Button size="sm" disabled={!valid} onClick={() => onApply({ start, end })} className="mt-1 w-full">
        Apply range
      </Button>
    </div>
  );
}
