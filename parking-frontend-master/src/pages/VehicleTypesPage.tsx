import { useMemo, useState } from 'react';
import { TruckIcon } from '@heroicons/react/24/outline';
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiTile } from '@/components/tenants/primitives';
import { ConfirmDeleteDialog } from '@/components/settings/ConfirmDeleteDialog';
import { VehicleTypeDialog } from '@/components/settings/VehicleTypeDialog';
import {
  formatDuration,
  rateSummary,
  resolvePlan,
  type PricingPlan,
  type VehicleType,
} from '@/components/settings/types';
import {
  useDeleteVehicleTypeMutation,
  useGetConfigurationQuery,
  useGetPricingPlansQuery,
} from '@/app/(public)/(pages)/settings/_redux/api';
import { useGetStaffQuery, useGetVehicleTypesQuery } from '@/app/(public)/(pages)/home/_redux/api';

const NONE: never[] = [];

interface StaffRow {
  vehicle_type: string | null;
}

// Vehicle types are the bridge between a parked vehicle and what it costs: each
// one carries a category (which tenant quota it consumes), a pricing plan and a
// free grace period.
const VehicleTypesPage = () => {
  const { data: typesData, isLoading, isError } = useGetVehicleTypesQuery(undefined);
  const { data: plansData } = useGetPricingPlansQuery(undefined);
  const { data: staffData } = useGetStaffQuery(undefined);
  const { data: configData } = useGetConfigurationQuery(undefined);
  const [deleteVehicleType, { isLoading: deleting }] = useDeleteVehicleTypeMutation();

  const vehicleTypes: VehicleType[] = typesData ?? NONE;
  const plans: PricingPlan[] = plansData ?? NONE;
  const staff: StaffRow[] = staffData ?? NONE;
  const currency: string = configData?.currency_symbol ?? 'NRs';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [activeType, setActiveType] = useState<VehicleType | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VehicleType | null>(null);

  // Staff carries its vehicle type by name, so registered-vehicle counts come
  // straight from that list.
  const registeredByTypeName = useMemo(() => {
    const map = new Map<string, number>();
    staff.forEach((s) => {
      if (!s.vehicle_type) return;
      map.set(s.vehicle_type, (map.get(s.vehicle_type) ?? 0) + 1);
    });
    return map;
  }, [staff]);

  const stats = useMemo(() => {
    const cars = vehicleTypes.filter((vt) => vt.category === 'CAR').length;
    const bikes = vehicleTypes.filter((vt) => vt.category === 'BIKE').length;
    const unpriced = vehicleTypes.filter((vt) => !resolvePlan(plans, vt)).length;
    const totalGrace = vehicleTypes.reduce((sum, vt) => sum + (vt.free_duration_minutes || 0), 0);
    const avgGrace = vehicleTypes.length ? Math.round(totalGrace / vehicleTypes.length) : 0;
    return { cars, bikes, unpriced, avgGrace };
  }, [vehicleTypes, plans]);

  const openCreate = () => {
    setDialogMode('create');
    setActiveType(null);
    setDialogOpen(true);
  };

  const openEdit = (vehicleType: VehicleType) => {
    setDialogMode('edit');
    setActiveType(vehicleType);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteVehicleType(pendingDelete.id).unwrap();
      toast.success('Vehicle type deleted');
      setPendingDelete(null);
    } catch {
      // Past sessions PROTECT their vehicle type, so the backend can refuse a
      // delete the registered-vehicle count alone cannot predict — the
      // interceptor surfaces that error.
    }
  };

  const registeredCount = pendingDelete
    ? registeredByTypeName.get(pendingDelete.name) ?? 0
    : 0;

  return (
    <PageShell
      title="Vehicle types"
      actions={
        <Button size="lg" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          New vehicle type
        </Button>
      }
    >
      {isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          Failed to load vehicle types.
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
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ) : vehicleTypes.length === 0 ? (
        <EmptyState
          icon={TruckIcon}
          title="No vehicle types yet"
          description="Add a vehicle type to price parking for it and count it against tenant quotas."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
            <KpiTile
              label="Vehicle types"
              value={vehicleTypes.length}
              caption={`${stats.cars} car · ${stats.bikes} bike`}
            />
            <KpiTile
              label="Registered vehicles"
              value={staff.length}
              caption="Tenant cards using these types"
            />
            <KpiTile
              label="Average grace"
              value={formatDuration(stats.avgGrace)}
              caption="Free before charging starts"
            />
            <KpiTile
              label="Needs attention"
              value={stats.unpriced}
              caption={stats.unpriced ? 'Types with no pricing plan' : 'All types priced'}
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase text-muted-foreground">
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Pricing plan</th>
                  <th className="px-3 py-2.5">Free duration</th>
                  <th className="px-3 py-2.5">Registered</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicleTypes.map((vt) => {
                  const plan = resolvePlan(plans, vt);
                  const registered = registeredByTypeName.get(vt.name) ?? 0;
                  return (
                    <tr key={vt.id} className="border-b border-border last:border-0 align-top">
                      <td className="px-3 py-2.5 font-medium text-foreground">{vt.name}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant="secondary" className="text-[10.5px]">
                          {vt.category === 'CAR' ? 'Car' : 'Bike'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {plan ? (
                          <>
                            <div className="text-foreground">{plan.name}</div>
                            <div className="text-[11.5px] text-muted-foreground">
                              {rateSummary(plan, currency)}
                            </div>
                          </>
                        ) : (
                          <span className="flex items-center gap-1 text-[12.5px] text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            No plan — charges nothing
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[13px] tabular-nums text-foreground">
                        {formatDuration(vt.free_duration_minutes)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[13px] tabular-nums text-foreground">
                        {registered > 0 ? registered : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${vt.name}`}
                            onClick={() => openEdit(vt)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${vt.name}`}
                            onClick={() => setPendingDelete(vt)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <VehicleTypeDialog
        mode={dialogMode}
        vehicleType={activeType}
        plans={plans}
        currency={currency}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        busy={deleting}
        title={`Delete ${pendingDelete?.name ?? 'vehicle type'}?`}
        description={
          registeredCount > 0
            ? `${registeredCount} registered vehicle${registeredCount === 1 ? '' : 's'} use this type and will be left without one. Vehicles in past sessions keep the type, and the backend will refuse the delete if any exist.`
            : 'This vehicle type will be removed permanently. The backend will refuse the delete if past sessions still reference it.'
        }
        confirmLabel="Delete type"
        onOpenChange={(next) => { if (!next) setPendingDelete(null); }}
        onConfirm={confirmDelete}
      />
    </PageShell>
  );
};

export default VehicleTypesPage;
