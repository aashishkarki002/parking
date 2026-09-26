import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

// Height of one character cell. Static and rolling cells share it, so a
// finished roll and plain text are pixel-identical and swapping one for the
// other (when the reel has done its job) is invisible.
const CELL = 'h-[1.25em] w-[1ch] align-top leading-[1.25em] text-center';

// Two full turns of 0-9 per digit: even a 0 spins, and every digit travels.
const STRIP = Array.from({ length: 20 }, (_, i) => i % 10);
const STAGGER_MS = 35;

function RollingDigit({ digit, index }: { digit: number; index: number }) {
  return (
    <span aria-hidden className={cn(CELL, 'relative inline-block overflow-hidden')}>
      <span
        className="uid-reel absolute inset-x-0 top-0 flex flex-col"
        // 20 cells, so each is 5% of the strip; land on the second turn.
        style={{ '--to': `${-(10 + digit) * 5}%`, '--delay': `${index * STAGGER_MS}ms` } as CSSProperties}
      >
        {STRIP.map((d, i) => (
          <span key={i} className={cn(CELL, 'block')}>
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

interface UidDisplayProps {
  text: string;
  // Roll the digits in, left to right, like an odometer. Mount it with roll on
  // to play it; it plays once and stays put.
  roll?: boolean;
  className?: string;
}

// A card number laid out cell by cell in monospace so the digits line up the
// same whether they are still, masked or rolling.
export function UidDisplay({ text, roll = false, className }: UidDisplayProps) {
  return (
    <span className={cn('inline-flex flex-wrap gap-x-[0.1em]', className)}>
      <span className="sr-only">{text}</span>
      {Array.from(text).map((ch, i) =>
        roll && /\d/.test(ch) ? (
          <RollingDigit key={i} digit={Number(ch)} index={i} />
        ) : (
          <span key={i} aria-hidden className={cn(CELL, 'inline-block')}>
            {ch}
          </span>
        )
      )}
    </span>
  );
}
