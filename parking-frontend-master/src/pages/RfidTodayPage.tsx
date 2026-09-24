import { IdentificationIcon } from '@heroicons/react/24/outline';
import { useGetRfidTodayQuery } from '@/app/(public)/(pages)/home/_redux/api';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatDate, formatDuration, formatTime } from '@/functions/dateFn';

interface TodayRow {
  session_id: string;
  ticket_number: string;
  tenant_name: string;
  company: string | null;
  license_plate: string | null;
  rfid_uid: string | null;
  entry_time: string;
  exit_time: string | null;
  duration_minutes: number | null;
  auto_closed: boolean;
  is_open: boolean;
}

interface TodayResponse {
  date: string;
  currently_parked: number;
  completed_minutes: number;
  sessions: TodayRow[];
}

// Tenant in/out for today (RFID taps and tenant QR cards alike). Currently
// parked first, whenever they arrived. Auto-closed rows (staff corrected a
// missed tap) are listed for audit but carry no duration — the backend
// excludes them from every total.
const RfidTodayPage = () => {
  const { data, isLoading, isError } = useGetRfidTodayQuery(undefined, { pollingInterval: 30000 });
  const today = data as TodayResponse | undefined;
  const rows = today?.sessions ?? [];

  return (
    <PageShell title="Tenant gate — today">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <Card>
          <CardContent className="py-3">
            <p className="text-[11px] font-medium uppercase text-muted-foreground">Currently parked</p>
            <p className="text-2xl font-semibold tabular-nums">{today?.currently_parked ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-[11px] font-medium uppercase text-muted-foreground">Completed stays</p>
            <p className="text-2xl font-semibold tabular-nums">
              {today ? formatDuration(today.completed_minutes) || '0m' : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError ? (
        <p className="text-sm text-destructive">Could not load today's sessions.</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={IdentificationIcon} title="No tenant activity today" description="Card taps will show up here." />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 text-xs font-medium text-muted-foreground uppercase hover:bg-muted/40">
                <TableHead className="px-3 py-2.5">Tenant</TableHead>
                <TableHead className="px-3 py-2.5">Entry</TableHead>
                <TableHead className="px-3 py-2.5">Exit</TableHead>
                <TableHead className="px-3 py-2.5">Duration</TableHead>
                <TableHead className="px-3 py-2.5">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.session_id} className={cn(i % 2 === 1 && 'bg-muted/20')}>
                  <TableCell className="px-3 py-2.5">
                    <span className="text-[12.5px] font-semibold text-foreground">{r.tenant_name}</span>
                    <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                      {[r.company, r.license_plate, r.rfid_uid && `card ${r.rfid_uid}`].filter(Boolean).join(' · ')}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    <span className="text-[13px] tabular-nums">{formatTime(r.entry_time)}</span>
                    <span className="block text-[10.5px] text-muted-foreground">{formatDate(r.entry_time)}</span>
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    {r.exit_time ? (
                      <span className="text-[13px] tabular-nums">{formatTime(r.exit_time)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    <span className={cn('text-[12px] font-semibold tabular-nums', r.is_open && 'text-primary')}>
                      {r.duration_minutes == null ? '—' : formatDuration(r.duration_minutes)}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    {r.is_open ? (
                      <Badge>Parked now</Badge>
                    ) : r.auto_closed ? (
                      <Badge variant="destructive" title="Closed by a staff correction — not a real exit time">
                        Auto-closed
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Left</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </PageShell>
  );
};

export default RfidTodayPage;
