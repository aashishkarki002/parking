import { useEffect, useRef } from 'react';
import config from '@/lib/public/config';

// A keyboard-wedge reader "types" a whole UID in one burst, a few ms per
// key. A pause longer than this between keys means a human is typing, so
// the buffer starts over.
const MAX_KEY_GAP_MS = 50;

// Writing .value directly is invisible to React-controlled inputs; go
// through the native setter and fire `input` so onChange sees it too.
const setNativeValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

const removeStrayUid = (uid: string) => {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  if (el.value.endsWith(uid)) setNativeValue(el, el.value.slice(0, -uid.length));
};

/**
 * Listens for RFID card taps anywhere on the page. The RFID reader and the
 * barcode scanner are both keyboard wedges, so their keystrokes arrive the
 * same way. A fast burst that matches `config.rfidUidPattern` and ends in
 * Enter counts as a card tap: the Enter is swallowed, and the UID is
 * removed from whatever input had focus. Anything else passes through
 * untouched, so the existing barcode inputs keep working as before.
 *
 * Runs in the capture phase so it sees the Enter before any React
 * onKeyDown (e.g. the hidden scan inputs) can act on it.
 */
const useRfidReader = (onTap: (uid: string) => void, enabled = true) => {
  const onTapRef = useRef(onTap);
  useEffect(() => {
    onTapRef.current = onTap;
  }, [onTap]);

  useEffect(() => {
    if (!enabled) return undefined;

    let buffer = '';
    let lastKeyAt = 0;

    const handleKeyDown = (event: KeyboardEvent) => {
      const now = performance.now();
      if (now - lastKeyAt > MAX_KEY_GAP_MS) buffer = '';
      lastKeyAt = now;

      if (event.key === 'Enter') {
        const candidate = buffer;
        buffer = '';
        if (!config.rfidUidPattern.test(candidate)) return;
        event.preventDefault();
        event.stopPropagation();
        removeStrayUid(candidate);
        onTapRef.current(candidate);
        return;
      }

      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        buffer += event.key;
      } else if (event.key !== 'Shift') {
        buffer = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled]);
};

export default useRfidReader;
