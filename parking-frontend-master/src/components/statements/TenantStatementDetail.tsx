import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ArrowLeft, Download, Printer, Search, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { cn } from '@/lib/utils';
import { CoveragePill, KpiTile, SharedFlag, StayBar } from './primitives';
import { csvEscape, downloadCsv } from './csv';
import { printTenantStatement } from './printStatement';
import { formatAmount, formatMinutes, PAGE_SIZE, type TenantStatementRow, type VisitRow } from './types';

type VisitTab = 'ALL' | 'OVERSTAYS';

const toCsv = (row: TenantStatementRow, visits: VisitRow[]) => {
  const headers = [
    'Ticket',
    'Plate',
    'Vehicle type',
    'Entry',
    'Exit',
    'Stayed (min)',
    'Free (min)',
    'Overage (min)',
    'Amount',
    'Billed to this tenant',
    'All stampers',
  ];
  const lines = visits.map((v) =>
    [
      v.ticket,
      v.plate,
      v.vehicleType ?? '',
      dayjs(v.entry).format('YYYY-MM-DD HH:mm'),
      v.exit ? dayjs(v.exit).format('YYYY-MM-DD HH:mm') : '',
      String(v.stayedMinutes),
      String(v.freeMinutes),
      String(v.overageMinutes),
      v.amount.toFixed(2),
      String(v.billed),
      v.stamperNames.join(' / '),
    ]
      .map((value) => csvEscape(String(value)))
      .join(',')
  );
  const total = [
    'TOTAL',
    '',
    '',
    '',
    '',
    '',
    '',
    String(row.overageMinutes),
    row.amount.toFixed(2),
    '',
    '',
  ].join(',');
  return [headers.join(','), ...lines, total].join('\n');
};

interface Props {
  row: TenantStatementRow;
  periodLabel: string;
  periodSlug: string;
  companyName: string;
  onBack: () => void;
}

export function TenantStatementDetail({ row, periodLabel, periodSlug, companyName, onBack }: Props) {
  const [tab, setTab] = useState<VisitTab>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return row.visits.filter((v) => {
      if (tab === 'OVERSTAYS' && !v.billed) return false;
      if (term && !`${v.ticket} ${v.plate} ${v.vehicleType ?? ''}`.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  }, [row.visits, tab, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);
  const sharedCount = row.visits.filter((v) => v.stamperNames.length > 1).length;

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.info('Nothing to export.');
      return;
    }
    const slug = row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    downloadCsv(`statement-${slug}-${periodSlug}.csv`, toCsv(row, filtered));
  };

  const handlePrint = () => {
    if (!printTenantStatement(row, periodLabel, companyName)) {
      toast.error('Could not open the print window — allow pop-ups for this site.');
    }
  };

  const changeTab = (next: VisitTab) => {
    setTab(next);
    setPage(0);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All tenants
        </button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" />
            Print statement
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold text-foreground">{row.name}</h2>
        <p className="text-xs text-muted-foreground">
          {[row.vendor?.location, row.vendor?.contact_person, row.vendor?.contact_email]
            .filter(Boolean)
            .join(' · ') || 'Guest parking statement'}
          {' · '}
          {periodLabel}
          {row.vendor ? ` · stamps grant ${formatMinutes(row.vendor.stamp_free_minutes)}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        <KpiTile
          label="Guests hosted"
          value={row.guests}
          caption={
            sharedCount > 0
              ? `${sharedCount} also stamped by another tenant`
              : 'Tickets this tenant stamped'
          }
        />
        <KpiTile
          label="Overstays"
          value={row.overstays}
          caption={`${row.guests - row.overstays} stayed inside the free window`}
          tone={row.overstays > 0 ? 'warning' : undefined}
        />
        <KpiTile
          label="Overage time"
          value={row.overageMinutes > 0 ? formatMinutes(row.overageMinutes) : '—'}
          caption="Beyond the minutes the stamps granted"
        />
        <KpiTile
          label="Amount due"
          value={formatAmount(row.amount)}
          caption="Accrued · not marked paid anywhere"
          tone={row.amount > 0 ? 'danger' : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => changeTab(v as VisitTab)}>
          <TabsList>
            <TabsTrigger value="ALL">All stamped ({row.guests})</TabsTrigger>
            <TabsTrigger value="OVERSTAYS">Overstays only ({row.overstays})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search ticket or plate"
            className="h-9 pl-8 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPage(0);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Ticket</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
                <TableHead className="min-w-[130px]">Stayed vs free</TableHead>
                <TableHead className="text-right">Over</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    {tab === 'OVERSTAYS'
                      ? 'No guest overstayed the free window in this period.'
                      : 'No guest visits match that search.'}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((v) => (
                  <TableRow key={`${v.sessionId}-${v.ticket}`}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[13px] text-foreground">{v.ticket}</span>
                        <SharedFlag stampers={v.stamperNames} name={row.name} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-[13px] text-foreground">{v.plate}</span>
                        {v.vehicleType && (
                          <span className="text-xs text-muted-foreground">{v.vehicleType}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground whitespace-nowrap">
                      {dayjs(v.entry).format('DD MMM, hh:mm a')}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground whitespace-nowrap">
                      {v.exit ? dayjs(v.exit).format('DD MMM, hh:mm a') : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-[12.5px] tabular-nums text-foreground">
                          {formatMinutes(v.stayedMinutes)}
                          <span className="text-muted-foreground"> / {formatMinutes(v.freeMinutes)} free</span>
                        </span>
                        <StayBar stayed={v.stayedMinutes} free={v.freeMinutes} />
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-[13px] tabular-nums',
                        v.overageMinutes > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                      )}
                    >
                      {v.overageMinutes > 0 ? formatMinutes(v.overageMinutes) : '—'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-[13px] font-semibold tabular-nums',
                        v.amount > 0 ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {v.amount > 0 ? formatAmount(v.amount) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <CoveragePill billed={v.billed} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {sharedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {sharedCount} of these tickets were stamped by more than one tenant. Each tenant that
          stamped is credited with the guest, but only the last stamper is billed — so a shared
          ticket can appear here with no amount against it.
        </p>
      )}

      {pageCount > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setPage((p) => Math.max(0, p - 1));
                }}
              />
            </PaginationItem>
            {Array.from({ length: pageCount }).map((_, i) => (
              <PaginationItem key={i}>
                <PaginationLink
                  href="#"
                  isActive={i === clampedPage}
                  onClick={(e) => {
                    e.preventDefault();
                    setPage(i);
                  }}
                >
                  {i + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setPage((p) => Math.min(pageCount - 1, p + 1));
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
