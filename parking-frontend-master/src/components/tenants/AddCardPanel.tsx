import { useState, type FormEvent } from 'react';
import { Check, LoaderCircle, Nfc, TriangleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import config from '@/lib/public/config';
import { cn } from '@/lib/utils';
import type { AddCardPhase } from '@/components/tenants/useAddCard';

interface AddCardPanelProps {
  // Referenced by the dialog footer's submit button, which sits outside the
  // scroll area (and so outside this <form>).
  formId: string;
  phase: AddCardPhase;
  error: string | null;
  onSubmit: (uid: string) => void;
}

const COPY: Record<AddCardPhase, { title: string; hint: string }> = {
  listening: { title: 'Tap the card on the reader', hint: 'The number is read in automatically.' },
  saving: { title: 'Reading card…', hint: 'Adding it to this member.' },
  added: { title: 'Card added', hint: 'It is active and ready to tap at the gate.' },
  error: { title: 'Card not added', hint: '' },
};

const TONE: Record<AddCardPhase, string> = {
  listening: 'bg-accent text-primary',
  saving: 'bg-accent text-primary',
  added: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
  error: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400',
};

// The add-card screen for the member popup. The card on top of the popup does
// the talking while a tap is being read; this panel says what state the
// reader is in and carries the type-it-in fallback.
export function AddCardPanel({ formId, phase, error, onSubmit }: AddCardPanelProps) {
  const [value, setValue] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const busy = phase === 'saving' || phase === 'added';

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const uid = value.trim();
    // Same rule the gate's reader uses to tell a card tap from a barcode: a
    // card typed in here that fails it could never be recognised at the booth.
    if (!config.rfidUidPattern.test(uid)) {
      setFieldError('Enter the number exactly as the reader types it, e.g. 0012345678.');
      return;
    }
    setFieldError(null);
    onSubmit(uid);
  };

  const Icon = phase === 'saving' ? LoaderCircle : phase === 'added' ? Check : phase === 'error' ? TriangleAlert : Nfc;
  const hint = phase === 'error' ? error : COPY[phase].hint;

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 sm:p-4"
      >
        <span
          className={cn(
            'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-200',
            TONE[phase]
          )}
        >
          {phase === 'listening' && (
            <>
              <span className="listen-ring" />
              <span className="listen-ring" />
            </>
          )}
          {/* Re-keyed per phase so each state change lands with a small pop. */}
          <Icon key={phase} className={cn('pop-in h-5 w-5', phase === 'saving' && 'animate-spin')} />
        </span>
        <div className="min-w-0">
          <p className={cn('text-sm font-semibold text-foreground', phase === 'error' && 'text-red-600 dark:text-red-400')}>
            {COPY[phase].title}
          </p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>

      {phase !== 'added' && (
        <form id={formId} onSubmit={handleSubmit} noValidate>
          <div className="mb-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or type the number
            <span className="h-px flex-1 bg-border" />
          </div>
          <label htmlFor={`${formId}-uid`} className="sr-only">
            Card number
          </label>
          <Input
            id={`${formId}-uid`}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setFieldError(null);
            }}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder="0012345678"
            disabled={busy}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? `${formId}-uid-error` : undefined}
            className="h-9 font-mono tracking-wider tabular-nums"
          />
          {fieldError && (
            <p id={`${formId}-uid-error`} className="mt-1.5 text-xs text-red-600 dark:text-red-400">
              {fieldError}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
