import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import {
  useGetParkingPassesQuery,
  useGetStaffQuery,
  useGetVehicleTypesQuery,
  useGetVendorsQuery,
} from '@/app/(public)/(pages)/home/_redux/api';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { VehicleFormSheet } from '@/components/VehicleFormSheet';
import { TenantDirectory } from '@/components/tenants/TenantDirectory';
import { TenantMembers } from '@/components/tenants/TenantMembers';
import { MemberCardDialog } from '@/components/tenants/MemberCardDialog';
import {
  categoryFor,
  EXPIRING_WINDOW_DAYS,
  UNASSIGNED_KEY,
  type StaffMember,
  type TenantMember,
  type TenantRow,
  type Vendor,
  type VehicleCategory,
} from '@/components/tenants/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UsersIcon } from '@heroicons/react/24/outline';

interface VehicleTypeOption {
  id: number;
  name: string;
  category: VehicleCategory;
}

interface PassVehicle {
  id: number;
}

interface ParkingPassRow {
  staff: PassVehicle | null;
  extra_vehicles: PassVehicle[];
  valid_until: string;
  is_active: boolean;
}

// Stable identity for the "not loaded yet" case, so the fallback below does
// not invalidate the memos on every render.
const NONE: never[] = [];

// Tenants are the top level: a tenant (Vendor) holds the car/bike quota and
// the gate-access flag, and its members (Staff) are the individual cardholders
// underneath it. This page renders that hierarchy — the directory first, one
// tenant's members after drilling in (?tenant=<id>, so the view is linkable
// and the browser back button walks back up).
const TenantsPage = () => {
  const {
    data: vendorsData,
    isLoading: vendorsLoading,
    isError: vendorsError,
  } = useGetVendorsQuery(undefined);
  const {
    data: staffData,
    isLoading: staffLoading,
    isError: staffError,
    refetch: refetchStaff,
  } = useGetStaffQuery(undefined);
  const { data: passesData } = useGetParkingPassesQuery(undefined);
  const { data: vehicleTypesData } = useGetVehicleTypesQuery(undefined);

  const vendors: Vendor[] = vendorsData ?? NONE;
  const staff: StaffMember[] = staffData ?? NONE;
  const passes: ParkingPassRow[] = passesData ?? NONE;
  const vehicleTypes: VehicleTypeOption[] = vehicleTypesData ?? NONE;

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedKey = searchParams.get('tenant');

  // Sampled once per mount so pass-expiry comparisons stay stable across
  // renders (and so the render pass itself stays pure).
  const [now] = useState(() => Date.now());

  const [sheetOpen, setSheetOpen] = useState(false);
  // Tracked by id so the card re-reads the member from fresh rows after a
  // refetch (e.g. when its card is deactivated from inside the dialog).
  const [viewMemberId, setViewMemberId] = useState<number | null>(null);

  const isLoading = vendorsLoading || staffLoading;
  const isError = vendorsError || staffError;

  // Staff carries no pass data, so an active pass is resolved from
  // /parking/parking-passes — a pass covers its primary staff member plus
  // every extra vehicle listed on it.
  const passUntilByStaffId = useMemo(() => {
    const map: Record<number, string> = {};
    passes.forEach((pass) => {
      if (!pass.is_active || !pass.valid_until) return;
      if (new Date(pass.valid_until).getTime() < now) return;
      [pass.staff, ...(pass.extra_vehicles ?? [])].forEach((vehicle) => {
        if (!vehicle) return;
        const current = map[vehicle.id];
        if (!current || new Date(pass.valid_until) > new Date(current)) {
          map[vehicle.id] = pass.valid_until;
        }
      });
    });
    return map;
  }, [passes, now]);

  const categoryByTypeName = useMemo(() => {
    const map: Record<string, VehicleCategory> = {};
    vehicleTypes.forEach((vt) => {
      map[vt.name] = vt.category;
    });
    return map;
  }, [vehicleTypes]);

  // Staff.company is serialized as the vendor's (unique) name, so members are
  // grouped by name rather than id.
  const membersByCompany = useMemo(() => {
    const map = new Map<string, TenantMember[]>();
    staff.forEach((s) => {
      const key = s.company ?? UNASSIGNED_KEY;
      const member: TenantMember = {
        ...s,
        category: categoryFor(s.vehicle_type, categoryByTypeName),
        active_pass_until: passUntilByStaffId[s.id] ?? null,
      };
      const bucket = map.get(key);
      if (bucket) bucket.push(member);
      else map.set(key, [member]);
    });
    return map;
  }, [staff, categoryByTypeName, passUntilByStaffId]);

  const rows: TenantRow[] = useMemo(() => {
    const expiryCutoff = now + EXPIRING_WINDOW_DAYS * 86_400_000;

    const build = (key: string, name: string, vendor: Vendor | null, members: TenantMember[]): TenantRow => ({
      key,
      name,
      vendor,
      members,
      carsUsed: members.filter((m) => m.category === 'CAR').length,
      bikesUsed: members.filter((m) => m.category === 'BIKE').length,
      carQuota: vendor?.car_quota ?? 0,
      bikeQuota: vendor?.bike_quota ?? 0,
      activeCards: members.filter((m) => m.is_card_active).length,
      monthlyPasses: members.filter((m) => m.active_pass_until).length,
      expiringSoon: members.filter(
        (m) => m.active_pass_until && new Date(m.active_pass_until).getTime() <= expiryCutoff
      ).length,
    });

    const tenantRows = vendors.map((v) =>
      build(String(v.id), v.name, v, membersByCompany.get(v.name) ?? [])
    );

    // Members whose company was cleared (Staff.company is nullable) would
    // otherwise disappear from a tenant-first view.
    const orphans = membersByCompany.get(UNASSIGNED_KEY) ?? [];
    if (orphans.length > 0) {
      tenantRows.push(build(UNASSIGNED_KEY, 'Unassigned members', null, orphans));
    }

    return tenantRows;
  }, [vendors, membersByCompany, now]);

  const selectedRow = selectedKey ? rows.find((r) => r.key === selectedKey) ?? null : null;

  const viewedMember =
    viewMemberId !== null ? selectedRow?.members.find((m) => m.id === viewMemberId) ?? null : null;

  const selectTenant = (key: string) => {
    setSearchParams({ tenant: key });
  };

  const clearTenant = () => {
    setSearchParams({});
  };

  const openRegisterVehicle = () => {
    setSheetOpen(true);
  };

  const viewMember = (member: TenantMember) => {
    setViewMemberId(member.id);
  };


  return (
    <PageShell
      title={selectedRow ? selectedRow.name : 'Tenants & vehicles'}
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
      ) : rows.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No tenants yet"
          description="Tenants you add will show up here, along with the vehicles registered under them."
        />
      ) : selectedKey && !selectedRow ? (
        <EmptyState
          icon={UsersIcon}
          title="Tenant not found"
          description="That tenant no longer exists. Go back to the directory to pick another one."
        />
      ) : selectedRow ? (
        <TenantMembers row={selectedRow} onBack={clearTenant} onOpenMember={viewMember} />
      ) : (
        <TenantDirectory rows={rows} onSelect={selectTenant} />
      )}

      {selectedRow && (
        <MemberCardDialog
          member={viewedMember}
          row={selectedRow}
          open={viewedMember !== null}
          onOpenChange={(open) => {
            if (!open) setViewMemberId(null);
          }}
          onChanged={refetchStaff}
        />
      )}

      <VehicleFormSheet
        defaultCompanyId={selectedRow?.vendor?.id ?? null}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSaved={() => {
          setSheetOpen(false);
          refetchStaff();
        }}
      />
    </PageShell>
  );
};

export default TenantsPage;
