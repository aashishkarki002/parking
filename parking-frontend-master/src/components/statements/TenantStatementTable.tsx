import { useMemo, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
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
import { formatAmount, formatMinutes, PAGE_SIZE, type TenantStatementRow } from './types';

interface Props {
  rows: TenantStatementRow[];
  periodLabel: string;
  onSelect: (key: string) => void;
}

export function TenantStatementTable({ rows, periodLabel, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      `${r.name} ${r.vendor?.location ?? ''} ${r.vendor?.contact_person ?? ''}`
        .toLowerCase()
        .includes(term)
    );
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search tenants"
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
        <span className="shrink-0 text-xs text-muted-foreground">
          {filtered.length} tenant{filtered.length === 1 ? '' : 's'} · {periodLabel}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tenant</TableHead>
                <TableHead className="text-right">Guests</TableHead>
                <TableHead className="text-right">Overstays</TableHead>
                <TableHead className="text-right">Overage</TableHead>
                <TableHead className="text-right">Owes</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No tenants match that search.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r) => (
                  <TableRow
                    key={r.key}
                    onClick={() => onSelect(r.key)}
                    className="cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(r.key);
                      }
                    }}
                  >
                    <TableCell className="max-w-[320px]">
                      {/* Tenant names are registered company names and run long
                          ("... Private Limited") — truncate rather than let one
                          row dictate the width of every numeric column. */}
                      <div className="flex flex-col">
                        <span className="truncate text-sm font-medium text-foreground" title={r.name}>
                          {r.name}
                        </span>
                        {r.vendor?.location && (
                          <span className="truncate text-xs text-muted-foreground" title={r.vendor.location}>
                            {r.vendor.location}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[13px] tabular-nums text-foreground">
                      {r.guests}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-[13px] tabular-nums',
                        r.overstays > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                      )}
                    >
                      {r.overstays}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[13px] tabular-nums text-muted-foreground">
                      {r.overageMinutes > 0 ? formatMinutes(r.overageMinutes) : '—'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-[13px] font-semibold tabular-nums',
                        r.amount > 0 ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {r.amount > 0 ? formatAmount(r.amount) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

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
