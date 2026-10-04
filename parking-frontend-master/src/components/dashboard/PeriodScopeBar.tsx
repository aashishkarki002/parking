import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Calendar, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { PRESETS, toISODate, type PresetKey, type ResolvedScope, type Scope } from './scope';

// The pill moves across the control, so it eases in and out; no overshoot —
// the tap carried no momentum of its own.
const PILL_EASE = 'cubic-bezier(0.77, 0, 0.175, 1)';
const PILL_MS = 250;

// Shared by the real segments and the "active" copy laid over them, so the two
// line up to the pixel.
const LIST_LAYOUT = 'grid h-8 w-full grid-cols-4 items-center gap-0.5 rounded-lg p-0.5 sm:inline-flex sm:w-auto';
const ITEM_LAYOUT = 'flex h-7 select-none items-center justify-center rounded-md px-3 text-[13px] font-medium leading-none';

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
 * It governs everything below it — figures, charts and the session list — so
 * it sits at the top of the content, right-aligned like any page-level filter,
 * with the window it resolves to named on the left where reading starts.
 */
export function PeriodScopeBar({ scope, onScopeChange, resolved }: PeriodScopeBarProps) {
  const isCustom = scope.kind === 'custom';
  const activeIndex = isCustom ? -1 : PRESETS.findIndex((p) => p.key === scope.key);

  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // The active segment's box as insets from the list's edges.
  const [pill, setPill] = useState<{ left: number; right: number } | null>(null);
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
      setPill({ left: itemBox.left - listBox.left, right: listBox.right - itemBox.right });
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
    <div className="mb-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p className="min-w-0 truncate text-xs leading-tight text-muted-foreground">
        <span className="font-medium tabular-nums text-foreground/80">{resolved.rangeLabel}</span>
        <span className="mx-1.5 opacity-40">·</span>
        compared with {resolved.comparisonLabel}
      </p>

      <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
        <div
          ref={listRef}
          role="radiogroup"
          aria-label="Time range"
          onKeyDown={onKeyDown}
          className={cn('group relative bg-muted', LIST_LAYOUT)}
        >
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
                  ITEM_LAYOUT,
                  'text-muted-foreground transition-[color,transform] duration-100 ease-out hover:text-foreground active:scale-[0.97] motion-reduce:active:scale-100',
                  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background'
                )}
              >
                {preset.label}
              </button>
            );
          })}

          {/* The selected state is a copy of the segments styled as active,
              clipped down to the active one. Sliding the clip moves the pill
              and its label color as one thing — no width animation, and no
              text color racing the pill. Inset by 1px less so the ring shows. */}
          {pill && (
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-0 motion-reduce:!transition-none',
                LIST_LAYOUT
              )}
              style={{
                clipPath: `inset(1px ${pill.right - 1}px 1px ${pill.left - 1}px round 7px)`,
                transition: animate ? `clip-path ${PILL_MS}ms ${PILL_EASE}` : undefined,
              }}
            >
              {PRESETS.map((preset, i) => (
                <span
                  key={preset.key}
                  className={cn(
                    ITEM_LAYOUT,
                    'bg-background text-foreground shadow-sm ring-1 ring-border/60',
                    // The copy covers the focused segment, so it draws the focus
                    // ring too — inside its box, where the clip can't cut it.
                    i === activeIndex && 'group-has-[:focus-visible]:outline-2 group-has-[:focus-visible]:-outline-offset-2 group-has-[:focus-visible]:outline-ring'
                  )}
                >
                  {preset.label}
                </span>
              ))}
            </div>
          )}
        </div>

        <CustomRangePopover scope={scope} onScopeChange={onScopeChange} />
      </div>

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
            // button is the only thing carrying the selection, so it fills in.
            variant={isCustom ? 'secondary' : 'outline'}
            size="sm"
            aria-label="Custom date range"
            className="h-8 shrink-0 gap-1.5 rounded-lg px-3 text-[13px] font-medium"
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
