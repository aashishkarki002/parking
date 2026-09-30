// Mirrors backend management/serializers.py (StudentSerializer,
// StudentRequestSerializer) and student_views.py (preview payload).

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type RequestStatus = 'PENDING' | 'PARTIAL' | 'REVIEWED';
export type DayCode = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export const DAYS: DayCode[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export interface Student {
  id: number;
  request: number;
  vendor: number;
  vendor_name: string;
  sn: string;
  name: string;
  contact_number: string;
  license_plate: string;
  vehicle_type: number | null;
  vehicle_type_name: string | null;
  batch_start_date: string | null;
  batch_end_date: string;
  class_days: DayCode[];
  class_time_from: string | null;
  class_time_to: string | null;
  is_active: boolean;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string;
  // '' when the student gets free time today, else why not.
  gate_status: string;
  created_at: string;
}

export interface StudentRequest {
  id: number;
  vendor: number;
  vendor_name: string;
  submitted_by: string | null;
  submitted_at: string;
  source: 'MANUAL' | 'CSV' | 'EXCEL';
  note: string;
  status: RequestStatus;
  counts: { total: number; pending: number; approved: number; rejected: number };
  students?: Student[];
}

// One row as the tenant types it, or as the preview endpoint returns it.
export interface StudentRow {
  sn: string;
  name: string;
  contact_number: string;
  license_plate: string;
  vehicle_type: string | number | null;
  vehicle_type_name?: string | null;
  batch_start_date: string | null;
  batch_end_date: string | null;
  class_days: DayCode[];
  class_time_from: string | null;
  class_time_to: string | null;
  is_active: boolean;
}

export interface RowIssue {
  row: number;
  sn?: string;
  field: string;
  message: string;
}

export interface PreviewResponse {
  source: 'MANUAL' | 'CSV' | 'EXCEL';
  rows: StudentRow[];
  errors: RowIssue[];
  warnings: RowIssue[];
}

// Attached to a parking session by the backend when the vehicle is a student.
export interface SessionStudent {
  id: number;
  name: string;
  vendor: string;
  license_plate: string;
  contact_number?: string;
  batch_end_date: string;
}

// ParkingSession.student_billing_summary: why a student's ticket was or
// wasn't free. null until the ticket is billed at exit.
export interface SessionStudentBilling {
  applied: boolean;
  free_from: string | null;
  free_to: string | null;
  free_minutes: number;
  message: string;
}

export const formatDays = (days: DayCode[]) => {
  if (!days?.length) return '—';
  if (days.length === 7) return 'Daily';
  const title = (d: string) => d[0] + d.slice(1).toLowerCase();
  return DAYS.filter((d) => days.includes(d)).map(title).join(', ');
};

export const formatClassTime = (from: string | null, to: string | null) =>
  from || to ? `${from?.slice(0, 5) ?? '?'}–${to?.slice(0, 5) ?? '?'}` : '—';

export const REVIEW_BADGE: Record<ReviewStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400' },
};

export const REQUEST_BADGE: Record<RequestStatus, { label: string; className: string }> = {
  PENDING: REVIEW_BADGE.PENDING,
  PARTIAL: { label: 'Partly reviewed', className: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-400' },
  REVIEWED: { label: 'Reviewed', className: 'bg-muted text-muted-foreground' },
};
