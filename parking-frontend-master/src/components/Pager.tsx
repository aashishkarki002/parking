import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const count = new Intl.NumberFormat('en-IN');

interface PagerProps {
  /** Zero-based. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

// "1–10 of 7,720  ‹ ›" — a list footer, not a page picker. Nobody jumps to
// page 412 of a session log; they search or filter instead.
export function Pager({ page, pageSize, total, onPageChange, className }: PagerProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <div className={cn('flex items-center justify-between', className)}>
      <span className="text-xs tabular-nums text-muted-foreground">
        {count.format(from)}–{count.format(to)} of {count.format(total)}
      </span>
      <div className="flex items-center gap-1">
        <PagerButton label="Previous page" disabled={page <= 0} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </PagerButton>
        <PagerButton label="Next page" disabled={page >= pageCount - 1} onClick={() => onPageChange(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </PagerButton>
      </div>
    </div>
  );
}

function PagerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md text-foreground',
        'transition-[background-color,transform,opacity] duration-150 ease-out hover:bg-muted active:scale-[0.94]',
        'motion-reduce:active:scale-100 outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-30'
      )}
    >
      {children}
    </button>
  );
}
