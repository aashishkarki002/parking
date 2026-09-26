export interface MixSegment {
  label: string;
  value: number;
  pct: number;
  color: string;
}

// The dashboard's chart ramp, straight from the theme tokens in index.css, so
// donuts, bars and legends all speak the same palette and follow light/dark
// automatically. Rank 0 is the most common bucket in a card, so it gets the
// brand primary — the eye lands on whichever category dominates.
export const MIX_PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];
