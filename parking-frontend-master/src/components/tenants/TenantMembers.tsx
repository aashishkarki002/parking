import { useMemo, useState } from 'react';
import { ArrowLeft, Motorbike, Car, ChevronLeft, ChevronRight, Eye, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatDate } from '@/functions/dateFn';
import { GatePill, KpiTile, StatusPill } from '@/components/tenants/primitives';
import {
  EXPIRING_WINDOW_DAYS,
  getInitials,
  type TenantMember,
  type TenantRow,
} from '@/components/tenants/types';

const PAGE_SIZE = 8;

interface TenantMembersProps {
  row: TenantRow;
  onBack: () => void;
  onOpenMember: (member: TenantMember) => void;
}

// Level 2 of the tenant flow: the cardholders belonging to one tenant.
export function TenantMembers({ row, onBack, onOpenMember }: TenantMembersProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(0);

  const vendor = row.vendor;

  // Sampled once per mount to keep the render pure.
  const [now] = useState(() => Date.now());

  const nextExpiring = useMemo(() => {
    return row.members
      .map((m) => m.active_pass_until)
      .filter((d): d is string => Boolean(d))
      .map((d) => new Date(d))
      .filter((d) => d.getTime() >= now)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  }, [row.members, now]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return row.members.filter((m) => {
      if (statusFilter === 'active' && !m.is_card_active) return false;
      if (statusFilter === 'inactive' && m.is_card_active) return false;
      if (!term) return true;
      return m.name.toLowerCase().includes(term) || m.license_plate.toLowerCase().includes(term);
    });
  }, [row.members, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All tenants
      </button>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
            {getInitials(row.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">{row.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[vendor?.location, vendor?.contact_person, vendor?.contact_email].filter(Boolean).join(' · ') ||
                'No contact details on file'}
            </p>
          </div>
        </div>
        {vendor && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <GatePill allowed={vendor.gate_access_allowed} />
            <span>{vendor.stamp_free_minutes} min per stamp</span>
            {vendor.last_synced_at && (
              <span>
                Synced {formatDate(vendor.last_synced_at)}
                {vendor.sync_source ? ` (${vendor.sync_source})` : ''}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        <KpiTile
          label="Members"
          value={row.members.length}
          caption={`${row.activeCards} active · ${row.members.length - row.activeCards} inactive`}
        />
        <KpiTile
          label="Cars"
          value={row.carQuota > 0 ? `${row.carsUsed}/${row.carQuota}` : row.carsUsed}
          caption={
            row.carQuota > 0 ? `${Math.max(0, row.carQuota - row.carsUsed)} free` : 'No quota synced'
          }
        />
        <KpiTile
          label="Bikes"
          value={row.bikeQuota > 0 ? `${row.bikesUsed}/${row.bikeQuota}` : row.bikesUsed}
          caption={
            row.bikeQuota > 0 ? `${Math.max(0, row.bikeQuota - row.bikesUsed)} free` : 'No quota synced'
          }
        />
        <KpiTile
          label={
            row.expiringSoon > 0 ? (
              <span className="text-amber-600 dark:text-amber-400">Monthly passes</span>
            ) : (
              'Monthly passes'
            )
          }
          value={row.monthlyPasses}
          caption={
            nextExpiring
              ? `Next ends ${formatDate(nextExpiring.toISOString())}`
              : `None ending in ${EXPIRING_WINDOW_DAYS} days`
          }
        />
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
            placeholder="Search member or plate…"
            className="pl-8"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as 'all' | 'active' | 'inactive');
            setPage(0);
          }}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground uppercase">
              <th className="w-9 px-3 py-2.5"></th>
              <th className="px-3 py-2.5">Member</th>
              <th className="px-3 py-2.5">Vehicle</th>
              <th className="px-3 py-2.5">Permit ends</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((m, i) => {
              const VehicleIcon = m.category === 'BIKE' ? Motorbike : Car;
              return (
                <tr
                  key={m.id}
                  className={cn(
                    'border-b border-border last:border-0 hover:bg-muted/40',
                    i % 2 === 1 && 'bg-muted/20'
                  )}
                >
                  <td className="px-3 py-2.5 text-muted-foreground">
                    <VehicleIcon className="h-4 w-4" />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-[11px] font-bold text-accent-foreground">
                        {getInitials(m.name)}
                      </span>
                      <span className="truncate font-semibold text-foreground">{m.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[13px] tracking-tight text-foreground tabular-nums">
                    {m.license_plate}
                    {m.vehicle_type && (
                      <span className="block font-sans text-[11px] text-muted-foreground">{m.vehicle_type}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[13px] tabular-nums text-foreground">
                    {m.active_pass_until ? (
                      formatDate(m.active_pass_until)
                    ) : (
                      <span className="text-muted-foreground">No expiry</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill active={m.is_card_active} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenMember(m)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {row.members.length === 0
                    ? 'No vehicles registered for this tenant yet.'
                    : 'No members match this search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>
          Showing {filtered.length === 0 ? 0 : clampedPage * PAGE_SIZE + 1}–
          {Math.min(filtered.length, clampedPage * PAGE_SIZE + PAGE_SIZE)} of {filtered.length} vehicles
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
