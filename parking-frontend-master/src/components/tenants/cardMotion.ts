// One-shot gestures for the member card, played with the Web Animations API so
// a second tap starts a fresh one from wherever the first left the card. Both
// are skipped under prefers-reduced-motion — the panel text says the same
// thing without moving anything.

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The card takes the tap: a small press and release.
export function pressCard(el: HTMLElement | null) {
  if (!el || prefersReducedMotion()) return;
  el.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(0.985)', offset: 0.3 }, { transform: 'scale(1)' }],
    { duration: 360, easing: EASE_OUT }
  );
}

// A refused card: a short side-to-side that settles, like shaking your head.
export function rejectCard(el: HTMLElement | null) {
  if (!el || prefersReducedMotion()) return;
  el.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-6px)', offset: 0.2 },
      { transform: 'translateX(5px)', offset: 0.45 },
      { transform: 'translateX(-3px)', offset: 0.7 },
      { transform: 'translateX(0)' },
    ],
    { duration: 340, easing: 'ease-out' }
  );
}
