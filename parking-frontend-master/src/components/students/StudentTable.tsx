import type { ReactNode } from 'react';
import dayjs from 'dayjs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ReviewBadge } from './StatusBadge';
import { formatClassTime, formatDays, type Student } from './types';

interface StudentTableProps {
  students: Student[];
  // Extra leading cell (e.g. a selection checkbox) and trailing cell (actions).
  lead?: { header: ReactNode; cell: (s: Student) => ReactNode };
  trail?: { header: ReactNode; cell: (s: Student) => ReactNode };
  showVendor?: boolean;
  // Whole-row click target (e.g. toggling selection) and its highlighted state.
  onRowClick?: (s: Student) => void;
  isSelected?: (s: Student) => boolean;
  empty?: ReactNode;
}

// How close the batch is to ending — the thing a reviewer most needs to spot.
function BatchEnd({ date }: { date: string | null }) {
  if (!date) return null;
  const days = dayjs(date).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (days > 14) return null;
  const label = days < 0 ? 'Ended' : days === 0 ? 'Ends today' : `${days} day${days === 1 ? '' : 's'} left`;
  return (
    <span
      className={cn(
        'mt-0.5 block text-[11px] font-medium',
        days < 0 ? 'text-destructive' : days <= 7 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
      )}
    >
      {label}
    </span>
  );
}

// Shared by the tenant portal and the admin review screen, so both sides see
// a student exactly the same way.
// Lead/trail cells hold their own controls, so clicks there don't reach the row.
export function StudentTable({ students, lead, trail, showVendor, onRowClick, isSelected, empty }: StudentTableProps) {
  const columns = 5 + (lead ? 1 : 0) + (trail ? 1 : 0);
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 text-xs uppercase hover:bg-muted/40">
          {lead && <TableHead className="w-8 px-3">{lead.header}</TableHead>}
          <TableHead className="px-3">Student</TableHead>
          <TableHead className="px-3">Vehicle</TableHead>
          <TableHead className="px-3">Batch</TableHead>
          <TableHead className="px-3">Classes</TableHead>
          <TableHead className="px-3">Review</TableHead>
          {trail && <TableHead className="px-3 text-right">{trail.header}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.length === 0 && empty && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={columns} className="py-10 text-center text-sm text-muted-foreground">
              {empty}
            </TableCell>
          </TableRow>
        )}
        {students.map((s) => {
          const selected = isSelected?.(s) ?? false;
          return (
            <TableRow
              key={s.id}
              data-state={selected ? 'selected' : undefined}
              onClick={onRowClick && (() => onRowClick(s))}
              className={cn(
                'transition-colors duration-100',
                onRowClick && 'cursor-pointer select-none',
                selected && 'bg-primary/[0.06] hover:bg-primary/10',
                !s.is_active && 'text-muted-foreground'
              )}
            >
              {lead && (
                <TableCell className="px-3 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                  {lead.cell(s)}
                </TableCell>
              )}
              <TableCell className="px-3 py-3 align-top">
                <span className="text-[13px] font-semibold tracking-[-0.005em] text-foreground">
                  {s.sn && <span className="mr-1 font-normal text-muted-foreground tabular-nums">{s.sn}.</span>}
                  {s.name}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-muted-foreground tabular-nums">
                  {[showVendor && s.vendor_name, s.contact_number, !s.is_active && 'Inactive'].filter(Boolean).join(' · ')}
                </span>
              </TableCell>
              <TableCell className="px-3 py-3 align-top">
                <span className="inline-block rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[12px] leading-none tracking-wide text-foreground">
                  {s.license_plate}
                </span>
                {s.vehicle_type_name && <span className="mt-1 block text-[11.5px] text-muted-foreground">{s.vehicle_type_name}</span>}
              </TableCell>
              <TableCell className="px-3 py-3 align-top text-[12.5px] tabular-nums">
                <span className="text-muted-foreground">{s.batch_start_date ?? '…'} →</span>{' '}
                <span className="font-semibold text-foreground">{s.batch_end_date}</span>
                <BatchEnd date={s.batch_end_date} />
              </TableCell>
              <TableCell className="px-3 py-3 align-top text-[12.5px]">
                {formatDays(s.class_days)}
                <span className="mt-0.5 block text-[11.5px] text-muted-foreground tabular-nums">
                  {formatClassTime(s.class_time_from, s.class_time_to)}
                </span>
              </TableCell>
              <TableCell className="px-3 py-3 align-top">
                <ReviewBadge status={s.review_status} />
                {s.review_status === 'REJECTED' && s.reject_reason && (
                  <span className="mt-1 block max-w-[220px] text-[11.5px] text-destructive">{s.reject_reason}</span>
                )}
                {s.review_status === 'APPROVED' && s.gate_status && (
                  <span className="mt-1 block max-w-[220px] text-[11.5px] text-muted-foreground">{s.gate_status}</span>
                )}
              </TableCell>
              {trail && (
                <TableCell className="px-3 py-2.5 text-right align-top" onClick={(e) => e.stopPropagation()}>
                  {trail.cell(s)}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
