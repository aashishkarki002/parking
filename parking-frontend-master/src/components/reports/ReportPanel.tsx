import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InsightCardProps {
  /** Category glyph, tinted with `tint`. */
  icon: LucideIcon;
  /** What the card is about: "Revenue lost", "Tenants". */
  category: string;
  /** CSS colour for the category line; identifies the card, never decorates. */
  tint: string;
  /** The takeaway, as a sentence. The one thing to remember from this card. */
  headline: ReactNode;
  /** The figures that back the headline up, in prose. */
  detail?: ReactNode;
  /** A control that changes what the card shows, at the category line. */
  control?: ReactNode;
  /** Where to go to act on the headline. */
  action?: { to: string; label: string };
  className?: string;
  children?: ReactNode;
}

/**
 * One insight, Health-Highlights style: a tinted category line, the takeaway
 * as a sentence, the numbers behind it in plain prose, at most one picture,
 * and a way to act on it. Each card answers a question in words first, so the
 * reader decides from the headline and only reads the chart to check it.
 */
export function InsightCard({
  icon: Icon,
  category,
  tint,
  headline,
  detail,
  control,
  action,
  className,
  children,
}: InsightCardProps) {
  return (
    <section className={cn('flex flex-col rounded-xl border border-border bg-card p-5 sm:p-6', className)}>
      <div className="flex min-h-7 items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: tint }}>
          <Icon className="h-4 w-4" strokeWidth={2.25} />
          {category}
        </span>
        {control}
      </div>

      <h3 className="mt-2 text-[19px] font-semibold leading-snug tracking-[-0.015em] text-foreground">
        {headline}
      </h3>
      {detail && (
        <p className="mt-1.5 max-w-[60ch] text-[13.5px] leading-relaxed text-muted-foreground">{detail}</p>
      )}

      {children && <div className="mt-5 flex flex-1 flex-col">{children}</div>}

      {action && (
        <Link
          to={action.to}
          className="group -mx-2 mt-4 inline-flex items-center gap-0.5 self-start rounded-md px-2 py-1 text-[13px] font-medium text-primary outline-none transition-[transform,background-color] duration-100 ease-out hover:bg-primary/8 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
        >
          {action.label}
          <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
        </Link>
      )}
    </section>
  );
}

/** Disclosure for the long tail a card leaves out by default. */
export function ShowMore({
  open,
  onToggle,
  count,
  noun,
}: {
  open: boolean;
  onToggle: () => void;
  count: number;
  noun: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="-mx-2 mt-2 inline-flex items-center gap-1 self-start rounded-md px-2 py-1 text-[12.5px] font-medium text-muted-foreground outline-none transition-[transform,color,background-color] duration-100 ease-out hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
    >
      {open ? 'Show less' : `Show all ${count} ${noun}`}
      <ChevronDown
        className={cn(
          'h-3.5 w-3.5 transition-transform duration-200 ease-[cubic-bezier(0.77,0,0.175,1)]',
          open && 'rotate-180'
        )}
      />
    </button>
  );
}

/** A card body with nothing to show for the window. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center rounded-lg bg-muted/40 px-4 py-8 text-center text-[12.5px] text-muted-foreground">
      {children}
    </p>
  );
}
