import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'react-toastify';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  downloadStudentTemplate,
  usePreviewStudentRequestMutation,
  useSubmitStudentRequestMutation,
} from './api';
import {
  DAYS,
  formatClassTime,
  formatDays,
  type DayCode,
  type PreviewResponse,
  type RowIssue,
  type StudentRow,
} from './types';

const ACCEPT = '.csv,.xlsx';

const emptyRow = (): StudentRow => ({
  sn: '',
  name: '',
  contact_number: '',
  license_plate: '',
  vehicle_type: '',
  batch_start_date: '',
  batch_end_date: '',
  class_days: [],
  class_time_from: '',
  class_time_to: '',
  is_active: true,
});


// Errors come back per row (1-based); group them for inline display.
const byRow = (issues: RowIssue[] = []) =>
  issues.reduce<Record<number, RowIssue[]>>((acc, issue) => {
    (acc[issue.row] ??= []).push(issue);
    return acc;
  }, {});

const errorPayload = (err: unknown) => (err as { data?: Partial<PreviewResponse> & { error?: string } })?.data;

function IssueList({ issues, tone }: { issues?: RowIssue[]; tone: 'error' | 'warning' }) {
  if (!issues?.length) return null;
  return (
    <ul className={cn('mt-1 space-y-0.5 text-[11px]', tone === 'error' ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')}>
      {issues.map((i, k) => (
        <li key={k}>{i.message}</li>
      ))}
    </ul>
  );
}

const COLUMNS = [
  'SN', 'Batch Start Date', 'Batch End Date', 'Class Days', 'Class Time From', 'Class Time To',
  'Student Name', 'Contact Number', 'Vehicle Number', 'Vehicle Type', 'Status',
];

function UploadSheet({ onSubmitted, disabled }: { onSubmitted: () => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewFile, { isLoading: previewing }] = usePreviewStudentRequestMutation();
  const [submit, { isLoading: submitting }] = useSubmitStudentRequestMutation();

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    setFile(picked);
    setPreview(null);
    try {
      setPreview(await previewFile({ file: picked }).unwrap());
    } catch {
      // The interceptor toasts file-level problems (wrong type, missing column).
      setFile(null);
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
  };

  const send = async () => {
    if (!file) return;
    try {
      const created = await submit({ file }).unwrap();
      toast.success(`Sent ${created.counts.total} student(s) for approval.`);
      reset();
      onSubmitted();
    } catch (err) {
      const data = errorPayload(err);
      if (data?.rows) setPreview(data as PreviewResponse);
    }
  };

  const errors = byRow(preview?.errors);
  const warnings = byRow(preview?.warnings);
  const errorRowCount = Object.keys(errors).length;
  const warningRowCount = Object.keys(warnings).length;
  const busy = previewing || submitting || disabled;
  const fileInput = (
    <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
  );

  if (preview && file) {
    const ok = errorRowCount === 0;
    return (
      <div className="flex flex-col gap-4">
        <Card className="gap-0 p-0">
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-foreground">{file.name}</p>
              <p className="text-[12px] text-muted-foreground tabular-nums">{preview.rows.length} student(s) found</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" onClick={reset} disabled={submitting}>
                <XMarkIcon /> Remove
              </Button>
              <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
                <ArrowPathIcon /> {previewing ? 'Checking…' : 'Replace file'}
              </Button>
              {fileInput}
            </div>
          </div>
          <div
            className={cn(
              'flex items-start gap-2.5 border-t px-4 py-3 text-[13px] leading-5 sm:px-5',
              ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
            )}
          >
            {ok ? <CheckCircleIcon className="mt-0.5 size-4 shrink-0" /> : <ExclamationCircleIcon className="mt-0.5 size-4 shrink-0" />}
            <p>
              {ok ? (
                <>
                  <span className="font-semibold">Everything looks good.</span> Review the list below, then send it.
                  {warningRowCount > 0 && ` ${warningRowCount} row(s) have notes worth a look.`}
                </>
              ) : (
                <>
                  <span className="font-semibold">{errorRowCount} row(s) need fixing.</span> Correct them in your sheet,
                  then replace the file.
                </>
              )}
            </p>
          </div>
        </Card>

        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 text-[12px] hover:bg-muted/40">
                <TableHead className="px-3">#</TableHead>
                <TableHead className="px-3">Student</TableHead>
                <TableHead className="px-3">Vehicle</TableHead>
                <TableHead className="px-3">Batch</TableHead>
                <TableHead className="px-3">Classes</TableHead>
                <TableHead className="px-3">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((r, i) => {
                const rowNo = i + 1;
                return (
                  <TableRow key={rowNo} className={cn(errors[rowNo] && 'bg-destructive/5')}>
                    <TableCell className="px-3 py-3 align-top text-muted-foreground tabular-nums">{r.sn || rowNo}</TableCell>
                    <TableCell className="px-3 py-3 align-top">
                      <span className="font-medium">{r.name || '—'}</span>
                      <span className="block text-[11.5px] text-muted-foreground">{r.contact_number}</span>
                      <IssueList issues={errors[rowNo]} tone="error" />
                      <IssueList issues={warnings[rowNo]} tone="warning" />
                    </TableCell>
                    <TableCell className="px-3 py-3 align-top">
                      {r.license_plate || '—'}
                      {r.vehicle_type_name && <span className="block text-[11.5px] text-muted-foreground">{r.vehicle_type_name}</span>}
                    </TableCell>
                    <TableCell className="px-3 py-3 align-top tabular-nums">
                      <span className="text-muted-foreground">{r.batch_start_date ?? '…'} →</span>{' '}
                      <span className="font-medium">{r.batch_end_date ?? '—'}</span>
                    </TableCell>
                    <TableCell className="px-3 py-3 align-top">
                      {formatDays(r.class_days)}
                      <span className="block text-[11.5px] text-muted-foreground">{formatClassTime(r.class_time_from, r.class_time_to)}</span>
                    </TableCell>
                    <TableCell className="px-3 py-3 align-top">{r.is_active ? 'Active' : 'Inactive'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-background/80 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
          {!ok && <p className="mr-auto text-[12px] text-destructive">Fix {errorRowCount} row(s) to send</p>}
          <Button size="lg" className="px-4" onClick={send} disabled={submitting || !ok || disabled}>
            {submitting ? 'Sending…' : `Send ${preview.rows.length} for approval`}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-disabled={busy}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!busy && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) choose(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-6 py-12 text-center outline-none transition-[background-color,border-color] duration-150 ease-out focus-visible:ring-3 focus-visible:ring-ring/50',
          dragging ? 'border-foreground/40 bg-muted' : 'border-border bg-card hover:border-foreground/25 hover:bg-muted/40',
          busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        )}
      >
        <p className="text-[14px] font-medium text-foreground">
          {previewing ? 'Checking your sheet…' : dragging ? 'Drop to upload' : 'Drop a CSV or Excel file, or click to choose'}
        </p>
        <p className="text-[13px] text-muted-foreground">Nothing is sent until you've reviewed it.</p>
        {fileInput}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">Start from the template</p>
          <p className="text-[12px] leading-5 text-muted-foreground">
            It has every column in the right order: <span className="text-foreground/80">{COLUMNS.join(', ')}</span>.
          </p>
        </div>
        <Button variant="outline" className="shrink-0" onClick={() => downloadStudentTemplate().catch(() => undefined)}>
          <ArrowDownTrayIcon /> Download template
        </Button>
      </div>
    </div>
  );
}

const DAY_NAMES: Record<DayCode, string> = {
  SUN: 'Sunday', MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday',
};
const DAY_PRESETS: { label: string; days: DayCode[] }[] = [
  { label: 'Sun–Fri', days: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI'] },
  { label: 'Every day', days: DAYS },
];

function DayPicker({ value, onChange }: { value: DayCode[]; onChange: (days: DayCode[]) => void }) {
  const toggle = (d: DayCode) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d]);
  const same = (days: DayCode[]) => days.length === value.length && days.every((d) => value.includes(d));
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex gap-1">
        {DAYS.map((d) => {
          const on = value.includes(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              aria-pressed={on}
              aria-label={DAY_NAMES[d]}
              title={DAY_NAMES[d]}
              className={cn(
                'size-9 rounded-full border text-[12px] font-semibold outline-none transition-[background-color,border-color,color,transform] duration-100 ease-out focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:active:scale-90',
                on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {d.slice(0, 2)}
            </button>
          );
        })}
      </div>
      <div className="flex gap-1">
        {DAY_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.days)}
            aria-pressed={same(p.days)}
            className={cn(
              'h-7 rounded-full px-2.5 text-[12px] font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
              same(p.days) ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  htmlFor,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[12px] font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-[11px] font-normal text-muted-foreground/70">Required</span>}
      </label>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-9 w-full rounded-lg bg-muted p-[3px]">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 rounded-md text-[13px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-3 focus-visible:ring-ring/50',
              active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Section heading inside a student card — groups related fields.
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2">
      <legend className="mb-3 text-[13px] font-medium text-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

type KeyedRow = StudentRow & { key: number };
let nextKey = 0;
const newRow = (row: StudentRow = emptyRow()): KeyedRow => ({ ...row, key: nextKey++ });

function TypeIn({ onSubmitted, disabled }: { onSubmitted: () => void; disabled?: boolean }) {
  const [rows, setRows] = useState<KeyedRow[]>(() => [newRow()]);
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const [issues, setIssues] = useState<{ errors: RowIssue[]; warnings: RowIssue[] }>({ errors: [], warnings: [] });
  const [submit, { isLoading }] = useSubmitStudentRequestMutation();

  const update = (index: number, patch: Partial<StudentRow>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const add = () => {
    const row = newRow({ ...emptyRow(), ...pickShared(rows[rows.length - 1]) });
    setRows((prev) => [...prev, row]);
    setFocusKey(row.key);
  };

  const remove = (index: number) => {
    setRows((prev) => prev.filter((_, k) => k !== index));
    // Issues are keyed by row number, so they no longer line up.
    setIssues({ errors: [], warnings: [] });
  };

  const send = async () => {
    // `key` is only for React; the backend doesn't know it.
    const students = rows.map((r, i) => {
      const row: Partial<KeyedRow> = { ...r, sn: r.sn || String(i + 1) };
      delete row.key;
      return row as StudentRow;
    });
    try {
      const created = await submit({ students }).unwrap();
      toast.success(`Sent ${created.counts.total} student(s) for approval.`);
      setRows([newRow()]);
      setIssues({ errors: [], warnings: [] });
      onSubmitted();
    } catch (err) {
      const data = errorPayload(err);
      setIssues({ errors: data?.errors ?? [], warnings: data?.warnings ?? [] });
    }
  };

  const errors = byRow(issues.errors);
  const warnings = byRow(issues.warnings);
  const errorCount = Object.keys(errors).length;

  return (
    <div className="flex flex-col gap-4">
      {rows.map((r, i) => {
        const id = `student-${r.key}`;
        const rowErrors = errors[i + 1];
        return (
          <Card
            key={r.key}
            className={cn(
              'gap-0 p-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200',
              rowErrors && 'border-destructive/40'
            )}
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
              <span className="w-5 shrink-0 text-[13px] text-muted-foreground tabular-nums">{i + 1}.</span>
              <p className={cn('min-w-0 flex-1 truncate text-[14px] font-semibold', r.name ? 'text-foreground' : 'text-muted-foreground')}>
                {r.name || 'New student'}
              </p>
              <label className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
                {r.is_active ? 'Active' : 'Inactive'}
                <Switch checked={r.is_active} onCheckedChange={(checked) => update(i, { is_active: checked })} />
              </label>
              {rows.length > 1 && (
                <Button variant="ghost" size="icon-sm" aria-label={`Remove student ${i + 1}`} onClick={() => remove(i)}>
                  <TrashIcon />
                </Button>
              )}
            </div>

            {(rowErrors || warnings[i + 1]) && (
              <div className={cn('border-b px-4 py-2.5 sm:px-5', rowErrors ? 'border-destructive/20 bg-destructive/5' : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30')}>
                <IssueList issues={rowErrors} tone="error" />
                <IssueList issues={warnings[i + 1]} tone="warning" />
              </div>
            )}

            <div className="grid gap-x-8 gap-y-6 px-4 py-5 sm:px-5 lg:grid-cols-2">
              <Group title="Student">
                <Field label="Full name" required htmlFor={`${id}-name`}>
                  <Input
                    id={`${id}-name`}
                    className="h-9"
                    autoFocus={focusKey === r.key}
                    value={r.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                  />
                </Field>
                <Field label="Contact number" htmlFor={`${id}-contact`}>
                  <Input
                    id={`${id}-contact`}
                    type="tel"
                    inputMode="tel"
                    className="h-9 tabular-nums"
                    value={r.contact_number}
                    onChange={(e) => update(i, { contact_number: e.target.value })}
                  />
                </Field>
              </Group>

              <Group title="Vehicle">
                <Field label="Vehicle number" required htmlFor={`${id}-plate`}>
                  <Input
                    id={`${id}-plate`}
                    className="h-9 font-mono tracking-wide uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case"
                    value={r.license_plate}
                    placeholder="e.g. BA 2 PA 1234"
                    onChange={(e) => update(i, { license_plate: e.target.value })}
                  />
                </Field>
                <Field label="Type">
                  <Segmented
                    label="Vehicle type"
                    value={String(r.vehicle_type ?? '')}
                    options={[
                      { value: 'Bike', label: 'Bike' },
                      { value: 'Car', label: 'Car' },
                    ]}
                    onChange={(v) => update(i, { vehicle_type: r.vehicle_type === v ? '' : v })}
                  />
                </Field>
              </Group>

              <Group title="Batch">
                <Field label="Starts" htmlFor={`${id}-start`}>
                  <Input
                    id={`${id}-start`}
                    type="date"
                    className="h-9"
                    value={r.batch_start_date ?? ''}
                    onChange={(e) => update(i, { batch_start_date: e.target.value })}
                  />
                </Field>
                <Field label="Ends" required htmlFor={`${id}-end`}>
                  <Input
                    id={`${id}-end`}
                    type="date"
                    className="h-9"
                    min={r.batch_start_date || undefined}
                    value={r.batch_end_date ?? ''}
                    onChange={(e) => update(i, { batch_end_date: e.target.value })}
                  />
                </Field>
              </Group>

              <Group title="Class time">
                <Field label="From" htmlFor={`${id}-from`}>
                  <Input
                    id={`${id}-from`}
                    type="time"
                    className="h-9"
                    value={r.class_time_from ?? ''}
                    onChange={(e) => update(i, { class_time_from: e.target.value })}
                  />
                </Field>
                <Field label="To" htmlFor={`${id}-to`}>
                  <Input
                    id={`${id}-to`}
                    type="time"
                    className="h-9"
                    value={r.class_time_to ?? ''}
                    onChange={(e) => update(i, { class_time_to: e.target.value })}
                  />
                </Field>
              </Group>

              <Field label="Class days" className="lg:col-span-2">
                <DayPicker value={r.class_days} onChange={(class_days) => update(i, { class_days })} />
              </Field>
            </div>
          </Card>
        );
      })}

      <button
        type="button"
        onClick={add}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3.5 text-[14px] font-medium text-foreground/70 outline-none transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-foreground/25 hover:bg-muted/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:active:scale-[0.98]"
      >
        <PlusIcon className="size-4" />
        Add another student
        {rows.length > 0 && <span className="hidden text-[12px] font-normal text-muted-foreground sm:inline">· copies batch and class times</span>}
      </button>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-border bg-background/80 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <p className={cn('mr-auto text-[12px] tabular-nums', errorCount ? 'text-destructive' : 'text-muted-foreground')}>
          {errorCount ? `${errorCount} student(s) need fixing` : `${rows.length} student(s) ready`}
        </p>
        <Button size="lg" className="px-4" onClick={send} disabled={isLoading || disabled}>
          {isLoading ? 'Sending…' : `Send ${rows.length} for approval`}
        </Button>
      </div>
    </div>
  );
}

// A new row usually belongs to the same batch as the one above it.
const pickShared = (row?: StudentRow): Partial<StudentRow> =>
  row
    ? {
        batch_start_date: row.batch_start_date,
        batch_end_date: row.batch_end_date,
        class_days: row.class_days,
        class_time_from: row.class_time_from,
        class_time_to: row.class_time_to,
        vehicle_type: row.vehicle_type,
      }
    : {};

type Method = 'upload' | 'type';
const METHODS: { value: Method; label: string }[] = [
  { value: 'upload', label: 'Upload a sheet' },
  { value: 'type', label: 'Type them in' },
];

export function NewStudentRequest({ onSubmitted, disabled }: { onSubmitted: () => void; disabled?: boolean }) {
  const [method, setMethod] = useState<Method>('upload');
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:w-72">
          <Segmented label="How to add students" value={method} options={METHODS} onChange={setMethod} />
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          {method === 'upload' ? 'Best for a whole batch.' : 'Quicker for one or two students.'}
        </p>
      </div>
      {method === 'upload' ? (
        <UploadSheet onSubmitted={onSubmitted} disabled={disabled} />
      ) : (
        <TypeIn onSubmitted={onSubmitted} disabled={disabled} />
      )}
    </div>
  );
}
