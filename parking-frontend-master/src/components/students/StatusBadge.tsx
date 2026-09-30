import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { REQUEST_BADGE, REVIEW_BADGE, type RequestStatus, type ReviewStatus } from './types';

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const { label, className } = REVIEW_BADGE[status];
  return <Badge className={cn('border-0', className)}>{label}</Badge>;
}

export function RequestBadge({ status }: { status: RequestStatus }) {
  const { label, className } = REQUEST_BADGE[status];
  return <Badge className={cn('border-0', className)}>{label}</Badge>;
}
