import { useMemo, useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, ChevronsRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { GatePill, KpiTile, QuotaMeter } from '@/components/tenants/primitives';
import { getInitials, type TenantRow } from '@/components/tenants/types';

const PAGE_SIZE = 8;

type GateFilter = 'all' | 'allowed' | 'blocked';

interface TenantDirectoryProps {
  rows: TenantRow[];
  onSelect: (key: string) => void;
}

// Level 1 of the tenant flow: every tenant (Vendor) with how much of its
// parking quota its members are consuming. Drilling into a row shows that
// tenant's members.
export function TenantDirectory({ rows, onSelect }: TenantDirectoryProps) {
  const [search, setSearch] = useState('');
  const [gateFilter, setGateFilter] = useState<GateFilter>('all');
  const [page, setPage] = useState(0);

  const stats = useMemo(() => {
    const tenants = rows.filter((r) => r.vendor).length;
    const gateAllowed = rows.filter((r) => r.vendor?.gate_access_allowed).length;
    const members = rows.reduce((sum, r) => sum + r.members.length, 0);
    const activeCards = rows.reduce((sum, r) => sum + r.activeCards, 0);
    const carsUsed = rows.reduce((sum, r) => sum + r.carsUsed, 0);
    const carQuota = rows.reduce((sum, r) => sum + r.carQuota, 0);
    const bikesUsed = rows.reduce((sum, r) => sum + r.bikesUsed, 0);
    const bikeQuota = rows.reduce((sum, r) => sum + r.bikeQuota, 0);
    return { tenants, gateAllowed, members, activeCards, carsUsed, carQuota, bikesUsed, bikeQuota };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (gateFilter === 'allowed' && !r.vendor?.gate_access_allowed) return false;
      if (gateFilter === 'blocked' && r.vendor?.gate_access_allowed !== false) return false;
      if (!term) return true;
      return (
        r.name.toLowerCase().includes(term) ||
        (r.vendor?.location || '').toLowerCase().includes(term) ||
        (r.vendor?.contact_person || '').toLowerCase().includes(term) ||
        (r.vendor?.contact_email || '').toLowerCase().includes(term) ||
        r.members.some(
          (m) =>
            m.name.toLowerCase().includes(term) || m.license_plate.toLowerCase().includes(term)
        )
      );
    });
  }, [rows, search, gateFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  // A zero quota means EasyManage has not pushed one yet, so the utilization
  // reading is suppressed rather than shown as 100%/undefined.
  const slots = (used: number, quota: number) =>
    quota > 0
      ? { value: `${used}/${quota}`, caption: `${Math.round((used / quota) * 100)}% used` }
      : { value: String(used), caption: 'No quota synced' };

  const carSlots = slots(stats.carsUsed, stats.carQuota);
  const bikeSlots = slots(stats.bikesUsed, stats.bikeQuota);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        <KpiTile
          label="Tenants"
          value={stats.tenants}
          caption={`${stats.gateAllowed} gate access · ${stats.tenants - stats.gateAllowed} blocked`}
        />
        <KpiTile
          label="Registered vehicles"
          value={stats.members}
          caption={`${stats.activeCards} active cards`}
        />
        <KpiTile label="Cars registered" value={carSlots.value} caption={carSlots.caption} />
        <KpiTile label="Bikes registered" value={bikeSlots.value} caption={bikeSlots.caption} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search tenant, contact, member, plate…"
            className="pl-8"
          />
        </div>
        <select
          value={gateFilter}
          onChange={(e) => {
            setGateFilter(e.target.value as GateFilter);
            setPage(0);
          }}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="all">All tenants</option>
          <option value="allowed">Gate access allowed</option>
          <option value="blocked">Gate access blocked</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground uppercase">
              <th className="px-3 py-2.5">Tenant</th>
              <th className="px-3 py-2.5">Contact</th>
              <th className="px-3 py-2.5">Cars</th>
              <th className="px-3 py-2.5">Bikes</th>
              <th className="px-3 py-2.5">Members</th>
              <th className="px-3 py-2.5">Gate</th>
              <th className="px-3 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr
                key={row.key}
                onClick={() => onSelect(row.key)}
                className={cn(
                  'cursor-pointer border-b border-border last:border-0 hover:bg-muted/40',
                  i % 2 === 1 && 'bg-muted/20'
                )}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-[11px] font-bold text-accent-foreground">
                      {row.vendor ? getInitials(row.name) : <Building2 className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-foreground">{row.name}</span>
                      {row.vendor?.location && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {row.vendor.location}
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {row.vendor?.contact_person || row.vendor?.contact_email ? (
                    <span className="min-w-0">
                      <span className="block truncate text-foreground">{row.vendor.contact_person || '—'}</span>
                      {row.vendor.contact_email && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {row.vendor.contact_email}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {row.vendor ? (
                    <QuotaMeter used={row.carsUsed} quota={row.carQuota} />
                  ) : (
                    <span className="font-mono text-[13px] tabular-nums text-foreground">{row.carsUsed}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {row.vendor ? (
                    <QuotaMeter used={row.bikesUsed} quota={row.bikeQuota} />
                  ) : (
                    <span className="font-mono text-[13px] tabular-nums text-foreground">{row.bikesUsed}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-[13px] tabular-nums text-foreground">{row.members.length}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {row.monthlyPasses > 0 ? `${row.monthlyPasses} monthly` : `${row.activeCards} active`}
                    {row.expiringSoon > 0 && (
                      <span className="text-amber-600 dark:text-amber-400"> · {row.expiringSoon} expiring</span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {row.vendor ? <GatePill allowed={row.vendor.gate_access_allowed} /> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(row.key);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
                  >
                    Members
                    <ChevronsRight className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No tenants match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>
          Showing {filtered.length === 0 ? 0 : clampedPage * PAGE_SIZE + 1}–
          {Math.min(filtered.length, clampedPage * PAGE_SIZE + PAGE_SIZE)} of {filtered.length} tenants
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={clampedPage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="tabular-nums">
            {clampedPage + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={clampedPage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
