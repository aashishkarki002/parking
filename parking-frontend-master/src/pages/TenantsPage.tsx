import { useMemo, useState } from 'react';
import { Bike, Car, ChevronLeft, ChevronRight, Eye, Plus, Search } from 'lucide-react';
import { useGetStaffQuery } from '@/app/(public)/(pages)/home/_redux/api';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { VehicleFormSheet } from '@/components/VehicleFormSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDate } from '@/functions/dateFn';
import { UsersIcon } from '@heroicons/react/24/outline';

interface StaffMember {
  id: number;
  name: string;
  company: string | null;
  license_plate: string;
  vehicle_type: string | null;
  is_card_active: boolean;
  active_pass_until: string | null;
  card_code?: string;
}

const PAGE_SIZE = 8;

const getInitials = (name: string) =>
  name
    .replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s+/i, '')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

const isBike = (vehicleType: string | null) => /bike|motor|scooter/i.test(vehicleType || '');

// Baseline permanent card ("Tenant") vs a time-boxed pass on top of it
// ("Monthly") — the only two permit shapes the Staff/ParkingPass models
// actually support today.
function PermitBadge({ hasActivePass }: { hasActivePass: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        hasActivePass
          ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300'
          : 'border-primary/20 bg-secondary text-secondary-foreground'
      )}
    >
      {hasActivePass ? 'Monthly' : 'Tenant'}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        active
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400'
          : 'border-border bg-muted text-muted-foreground'
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-muted-foreground')} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function KpiTile({
  label,
  value,
  caption,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  caption: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-card p-4">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{label}</span>
      <span className="text-[26px] leading-none font-bold tracking-tight tabular-nums text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{caption}</span>
    </div>
  );
}

const TenantsPage = () => {
  const { data, isLoading, isError, refetch } = useGetStaffQuery(undefined);
  const staff: StaffMember[] = data ?? [];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(0);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  const openRegisterVehicle = () => {
    setFormMode('create');
    setSelectedStaff(null);
    setSheetOpen(true);
  };

  const openVehicleDetail = (member: StaffMember) => {
    setFormMode('edit');
    setSelectedStaff(member);
    setSheetOpen(true);
  };

  const stats = useMemo(() => {
    const total = staff.length;
    const active = staff.filter((s) => s.is_card_active).length;
    const monthly = staff.filter((s) => s.active_pass_until).length;
    const now = Date.now();
    const expiringSoon = staff
      .filter((s) => s.active_pass_until)
      .map((s) => new Date(s.active_pass_until as string))
      .filter((d) => d.getTime() - now <= 30 * 86_400_000)
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      total,
      active,
      inactive: total - active,
      tenantOnly: active - monthly,
      monthly,
      expiringCount: expiringSoon.length,
      nextExpiring: expiringSoon[0] ?? null,
    };
  }, [staff]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (statusFilter === 'active' && !s.is_card_active) return false;
      if (statusFilter === 'inactive' && s.is_card_active) return false;
      if (!term) return true;
      return (
        s.name.toLowerCase().includes(term) ||
        s.license_plate.toLowerCase().includes(term) ||
        (s.company || '').toLowerCase().includes(term)
      );
    });
  }, [staff, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const handleStatusChange = (value: 'all' | 'active' | 'inactive') => {
    setStatusFilter(value);
    setPage(0);
  };

  return (
    <PageShell
      title="Tenants & vehicles"
      actions={
        <Button size="lg" onClick={openRegisterVehicle}>
          <Plus className="h-3.5 w-3.5" />
          Register vehicle
        </Button>
      }
    >
      {isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          Failed to load tenants.
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
      ) : staff.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No tenants yet"
          description="Tenants you add will show up here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
            <KpiTile
              label="Registered"
              value={stats.total}
              caption={`${stats.active} active · ${stats.inactive} inactive`}
            />
            <KpiTile
              label="Tenant permits"
              value={stats.tenantOnly}
              caption={stats.active > 0 ? `${Math.round((stats.tenantOnly / stats.active) * 100)}% of active` : '—'}
            />
            <KpiTile label="Monthly passes" value={stats.monthly} caption="time-boxed permits" />
            <KpiTile
              label={<span className="text-amber-600 dark:text-amber-400">Expiring ≤ 30d</span>}
              value={<span className="text-amber-600 dark:text-amber-400">{stats.expiringCount}</span>}
              caption={stats.nextExpiring ? `Next: ${formatDate(stats.nextExpiring.toISOString())}` : 'None upcoming'}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search plate, tenant, company…"
                className="pl-8"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value as 'all' | 'active' | 'inactive')}
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
                  <th className="px-3 py-2.5">Tenant</th>
                  <th className="px-3 py-2.5">Vehicle</th>
                  <th className="px-3 py-2.5">Permit</th>
                  <th className="px-3 py-2.5">Permit ends</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s, i) => {
                  const VehicleIcon = isBike(s.vehicle_type) ? Bike : Car;
                  return (
                    <tr
                      key={s.id}
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
                            {getInitials(s.name)}
                          </span>
                          <span className="truncate font-semibold text-foreground">{s.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[13px] tracking-tight text-foreground tabular-nums">
                        {s.license_plate}
                      </td>
                      <td className="px-3 py-2.5">
                        <PermitBadge hasActivePass={Boolean(s.active_pass_until)} />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[13px] tabular-nums text-foreground">
                        {s.active_pass_until ? (
                          formatDate(s.active_pass_until)
                        ) : (
                          <span className="text-muted-foreground">No expiry</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill active={s.is_card_active} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => openVehicleDetail(s)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>
              Showing {clampedPage * PAGE_SIZE + 1}–{Math.min(filtered.length, clampedPage * PAGE_SIZE + PAGE_SIZE)} of{' '}
              {filtered.length} vehicles
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
      )}

      <VehicleFormSheet
        mode={formMode}
        staff={selectedStaff}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSaved={() => {
          setSheetOpen(false);
          refetch();
        }}
      />
    </PageShell>
  );
};

export default TenantsPage;
