import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { Download } from 'lucide-react';
import { toast } from 'react-toastify';
import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { useGetSessionsQuery, useGetVendorsQuery } from '@/app/(public)/(pages)/home/_redux/api';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { buildStatement, monthsWithVisits } from '@/components/statements/derive';
import { KpiTile } from '@/components/statements/primitives';
import { csvEscape, downloadCsv } from '@/components/statements/csv';
import { TenantStatementDetail } from '@/components/statements/TenantStatementDetail';
import { TenantStatementTable } from '@/components/statements/TenantStatementTable';
import {
  formatAmount,
  formatMinutes,
  monthKey,
  resolvePeriod,
  type PeriodKey,
  type SessionRow,
  type TenantStatementRow,
  type VendorRow,
} from '@/components/statements/types';

// Until /parking/configuration is wired into the frontend, the printed
// statement's letterhead uses the same name the rest of the app hardcodes.
const COMPANY_NAME = 'Sallyan House';

const QUICK_RANGES: Array<{ key: PeriodKey; label: string }> = [
  { key: 'THIS_MONTH', label: 'This month' },
  { key: 'LAST_MONTH', label: 'Last month' },
  { key: 'LAST_30', label: 'Last 30 days' },
  { key: 'ALL', label: 'All time' },
];

// Stable identity for the "not loaded yet" case, so the fallback below does
// not invalidate the memos on every render.
const NONE: never[] = [];

const toSummaryCsv = (rows: TenantStatementRow[]) => {
  const headers = ['Tenant', 'Location', 'Contact', 'Guests', 'Overstays', 'Overage minutes', 'Amount due'];
  const lines = rows.map((r) =>
    [
      r.name,
      r.vendor?.location ?? '',
      r.vendor?.contact_person ?? '',
      String(r.guests),
      String(r.overstays),
      String(r.overageMinutes),
      r.amount.toFixed(2),
    ]
      .map((v) => csvEscape(String(v)))
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
};

// Guest parking, billed back to the tenant who validated the visit. Everything
// on this page is derived on the client from /parking/sessions — see
// components/statements/types.ts for why, and for what these figures do and
// do not mean.
const StatementsPage = () => {
  const {
    data: sessionsData,
    isLoading: sessionsLoading,
    isError: sessionsError,
  } = useGetSessionsQuery(undefined);
  const { data: vendorsData, isLoading: vendorsLoading } = useGetVendorsQuery(undefined);

  const sessions: SessionRow[] = sessionsData ?? NONE;
  const vendors: VendorRow[] = vendorsData ?? NONE;

  // Both the period and the drilled-into tenant live in the URL, so a link to
  // one tenant's month survives a refresh and can be pasted to someone else.
  // An absent period means "not chosen yet" — the default depends on the data,
  // which is not there on first render.
  const [searchParams, setSearchParams] = useSearchParams();
  const periodKey = searchParams.get('period');
  const selectedKey = searchParams.get('tenant');

  const now = dayjs();
  const months = useMemo(() => monthsWithVisits(sessions), [sessions]);

  // Default to the current month, since that is the bill being accrued right
  // now — but if nobody has been stamped in yet this month, open on the most
  // recent month that has guests instead of an empty page.
  const defaultKey: PeriodKey = useMemo(() => {
    const thisMonth = monthKey(now.startOf('month'));
    if (months.length === 0 || months.some((m) => m.key === thisMonth)) return 'THIS_MONTH';
    return months[0].key;
  }, [months, now]);

  const effectiveKey = periodKey ?? defaultKey;
  const period = useMemo(() => resolvePeriod(effectiveKey, now), [effectiveKey, now]);
  const statement = useMemo(
    () => buildStatement(sessions, vendors, period, now),
    [sessions, vendors, period, now]
  );

  const selectedRow = selectedKey
    ? statement.rows.find((r) => r.key === selectedKey) ?? null
    : null;

  const isLoading = sessionsLoading || vendorsLoading;

  // Changing the period drops the drill-down: a tenant with no visits in the
  // newly selected period would otherwise render as "not found".
  const changePeriod = (key: PeriodKey) => setSearchParams({ period: key });

  const selectTenant = (key: string) =>
    setSearchParams({ period: effectiveKey, tenant: key });
  const clearTenant = () => setSearchParams({ period: effectiveKey });

  const handleSummaryExport = () => {
    if (statement.rows.length === 0) {
      toast.info('Nothing to export.');
      return;
    }
    downloadCsv(`tenant-statements-${period.slug}.csv`, toSummaryCsv(statement.rows));
  };

  const periodSelect = (
    <Select value={effectiveKey} onValueChange={(v) => changePeriod(v ?? 'THIS_MONTH')}>
      <SelectTrigger className="h-9 w-[220px]">
        {/* Base UI hands the raw value to a render function; without one the
            trigger would show the key itself ("THIS_MONTH"). */}
        <SelectValue>{(value: string) => resolvePeriod(value, now).label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {QUICK_RANGES.map((r) => (
            <SelectItem key={r.key} value={r.key}>
              {r.label}
            </SelectItem>
          ))}
        </SelectGroup>
        {months.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Months with guests</SelectLabel>
              {months.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  );

  return (
    <PageShell
      title="Statements"
      actions={
        <>
          {periodSelect}
          {!selectedRow && (
            <Button variant="outline" onClick={handleSummaryExport}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          )}
        </>
      }
    >
      {sessionsError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          Failed to load guest visits.
        </div>
      ) : isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card p-4">
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ) : selectedKey && !selectedRow ? (
        <EmptyState
          icon={DocumentTextIcon}
          title="No statement for that tenant"
          description="That tenant stamped no guest tickets in the selected period. Go back to pick another one, or widen the period."
        />
      ) : selectedRow ? (
        <TenantStatementDetail
          row={selectedRow}
          periodLabel={period.label}
          periodSlug={period.slug}
          companyName={COMPANY_NAME}
          onBack={clearTenant}
        />
      ) : statement.rows.length === 0 ? (
        <EmptyState
          icon={DocumentTextIcon}
          title="No guest visits in this period"
          description="When a tenant stamps a visitor's ticket, that visit — and anything the visitor owes for overstaying the stamp — shows up here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
            <KpiTile
              label="Guests hosted"
              value={statement.totalGuests}
              caption={
                statement.sharedVisits > 0
                  ? `${statement.rows.length} tenants · ${statement.sharedVisits} shared ticket${statement.sharedVisits === 1 ? '' : 's'}`
                  : `Across ${statement.rows.length} tenant${statement.rows.length === 1 ? '' : 's'}`
              }
            />
            <KpiTile
              label="Overstays"
              value={statement.totalOverstays}
              caption={`${statement.totalGuests - statement.totalOverstays} stayed inside their free window`}
              tone={statement.totalOverstays > 0 ? 'warning' : undefined}
            />
            <KpiTile
              label="Overage time"
              value={statement.totalOverageMinutes > 0 ? formatMinutes(statement.totalOverageMinutes) : '—'}
              caption="Beyond the minutes the stamps granted"
            />
            <KpiTile
              label="Owed by tenants"
              value={formatAmount(statement.totalAmount)}
              caption="Accrued · not marked paid anywhere"
              tone={statement.totalAmount > 0 ? 'danger' : undefined}
            />
          </div>

          {statement.live.stillParked > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                {statement.live.stillParked} stamped guest
                {statement.live.stillParked === 1 ? ' is' : 's are'} still parked
              </span>
              {statement.live.alreadyOver > 0 ? (
                <>
                  {' '}
                  — {statement.live.alreadyOver} already past the free window
                  {statement.live.accrued > 0
                    ? `, ${formatAmount(statement.live.accrued)} accrued at last scan`
                    : ''}
                  .
                </>
              ) : (
                <> — all still inside the free window their stamps granted.</>
              )}{' '}
              These are excluded from the figures above until they exit.
            </div>
          )}

          <TenantStatementTable
            rows={statement.rows}
            periodLabel={period.label}
            onSelect={selectTenant}
          />
        </div>
      )}
    </PageShell>
  );
};

export default StatementsPage;
