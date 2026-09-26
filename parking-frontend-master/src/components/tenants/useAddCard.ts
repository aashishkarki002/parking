import { useCallback, useEffect, useRef, useState } from 'react';
import { useCreateRfidCardMutation } from '@/app/(public)/(pages)/home/_redux/api';

export type AddCardPhase = 'listening' | 'saving' | 'added' | 'error';

export interface Capture {
  id: number;
  uid: string;
  source: 'tap' | 'manual';
}

// The API answers a refused card with {uid: ['…']} (or {detail}, or a bare
// network message), so take the first readable string out of whichever it is.
const errorMessage = (err: unknown) => {
  const data = (err as { data?: unknown } | null)?.data;
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const first = Object.values(data as Record<string, unknown>)
      .flat()
      .find((v): v is string => typeof v === 'string');
    if (first) return first;
  }
  return 'Could not add the card. Try again.';
};

// Issuing an RFID card to one member, from either a reader tap or typed digits.
// `capture` is the card being (or last) issued and deliberately outlives the
// add screen: the card face keeps showing it, and the reel that rolled it in
// must not be unmounted and replayed when the screen closes.
export function useAddCard(staffId: number | undefined, onAdded: () => void) {
  const [createRfidCard] = useCreateRfidCardMutation();
  const [phase, setPhase] = useState<AddCardPhase>('listening');
  const [capture, setCapture] = useState<Capture | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped once per refused card so the UI can play its "no" cue exactly once.
  const [refusals, setRefusals] = useState(0);
  const seq = useRef(0);

  const onAddedRef = useRef(onAdded);
  useEffect(() => {
    onAddedRef.current = onAdded;
  }, [onAdded]);

  const submit = useCallback(
    async (uid: string, source: Capture['source']) => {
      if (staffId === undefined) return;
      // Show the card immediately; the request finishes behind the animation.
      seq.current += 1;
      setCapture({ id: seq.current, uid, source });
      setError(null);
      setPhase('saving');
      try {
        await createRfidCard({ staff: staffId, uid }).unwrap();
        setPhase('added');
        onAddedRef.current();
      } catch (err) {
        setCapture(null);
        setError(errorMessage(err));
        setPhase('error');
        setRefusals((n) => n + 1);
      }
    },
    [createRfidCard, staffId]
  );

  const reset = useCallback(() => {
    setPhase('listening');
    setCapture(null);
    setError(null);
  }, []);

  return { phase, capture, error, refusals, submit, reset };
}
