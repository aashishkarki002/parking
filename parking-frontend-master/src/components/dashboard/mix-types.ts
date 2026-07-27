export interface MixSegment {
  label: string;
  value: number;
  pct: number;
  color: string;
}

// Rank 0 is always the most common bucket in a card — giving it the brand
// accent (teal in dark mode) draws the eye to whichever category dominates.
export const LIGHT_MIX_PALETTE = ['#18181b', '#0d9488', '#f59e0b', '#a1a1aa', '#dc2626'];
export const DARK_MIX_PALETTE = ['#2dd4bf', '#f4f4f5', '#fbbf24', '#52525b', '#f87171'];
