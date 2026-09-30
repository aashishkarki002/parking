import { useMemo, useState } from 'react';
import { TagIcon } from '@heroicons/react/24/outline';
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiTile } from '@/components/tenants/primitives';
import { ConfirmDeleteDialog } from '@/components/settings/ConfirmDeleteDialog';
import { PricingPlanDialog } from '@/components/settings/PricingPlanDialog';
import { NightPricingCard } from '@/components/settings/NightPricingCard';
import {
  formatMoney,
  hasNightRate,
  nightWindowLabel,
  planTypeLabel,
  planWarning,
  rateSummary,
  resolvePlan,
  type PricingPlan,
  type VehicleType,
} from '@/components/settings/types';
import {
  useDeletePricingPlanMutation,
  useGetConfigurationQuery,
  useGetPricingPlansQuery,
} from '@/app/(public)/(pages)/settings/_redux/api';
import { useGetVehicleTypesQuery } from '@/app/(public)/(pages)/home/_redux/api';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';
import { useAppSelector } from '@/lib/public/hooks';
import { isSuperAdmin } from '@/lib/public/roles';

const NONE: never[] = [];

// The rate card behind every visitor charge: each plan is one pricing rule, and
// vehicle types point at a plan (VehicleType.pricing_plan is PROTECT, so a plan
// in use cannot be deleted until its types are moved off it).
const PricingPlansPage = () => {
  const loginState = useAppSelector(loginSelector);
  const { data: plansData, isLoading, isError } = useGetPricingPlansQuery(undefined);
  const { data: vehicleTypesData } = useGetVehicleTypesQuery(undefined);
  // ParkingConfigurationView is superadmin-only on the backend — skip the
  // call for admins so this page doesn't 403 just to read the currency
  // symbol; it already falls back to a default below.
  const { data: configData } = useGetConfigurationQuery(undefined, { skip: !isSuperAdmin(loginState) });
  const [deletePlan, { isLoading: deleting }] = useDeletePricingPlanMutation();

  const plans: PricingPlan[] = plansData ?? NONE;
  const vehicleTypes: VehicleType[] = vehicleTypesData ?? NONE;
  const currency: string = configData?.currency_symbol ?? 'NRs';
  // Unknown (undefined) for admins, who can't read the configuration.
  const nightEnabled: boolean | undefined = configData?.night_pricing_enabled;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [activePlan, setActivePlan] = useState<PricingPlan | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PricingPlan | null>(null);

  // Which vehicle types ride on each plan, keyed by plan id — the serializer's
  // `pricing_plan` string is PricingPlan.__str__, so it can't be matched to a
  // plan name directly (see resolvePlan).
  const typesByPlanId = useMemo(() => {
    const map = new Map<number, VehicleType[]>();
    vehicleTypes.forEach((vt) => {
      const plan = resolvePlan(plans, vt);
      if (!plan) return;
      const bucket = map.get(plan.id);
      if (bucket) bucket.push(vt);
      else map.set(plan.id, [vt]);
    });
    return map;
  }, [vehicleTypes, plans]);

  const stats = useMemo(() => {
    const unused = plans.filter((p) => (typesByPlanId.get(p.id) ?? NONE).length === 0).length;
    const incomplete = plans.filter((p) => planWarning(p)).length;
    const withMinimum = plans.filter((p) => Number(p.minimum_charge ?? 0) > 0).length;
    const priced = vehicleTypes.filter((vt) => resolvePlan(plans, vt)).length;
    const withNightRate = plans.filter(hasNightRate).length;
    return { unused, incomplete, withMinimum, priced, withNightRate };
  }, [plans, vehicleTypes, typesByPlanId]);

  const openCreate = () => {
    setDialogMode('create');
    setActivePlan(null);
    setDialogOpen(true);
  };

  const openEdit = (plan: PricingPlan) => {
    setDialogMode('edit');
    setActivePlan(plan);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deletePlan(pendingDelete.id).unwrap();
      toast.success('Pricing plan deleted');
      setPendingDelete(null);
    } catch {
      // Django PROTECTs a plan that is still referenced; the list guards
      // against that, so anything reaching here is already toasted by the
      // interceptor.
    }
  };

  return (
    <PageShell
      title="Pricing plans"
      actions={
        <Button size="lg" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          New plan
        </Button>
      }
    >
      {isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          Failed to load pricing plans.
        </div>
      ) : isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
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
      ) : plans.length === 0 ? (
        <EmptyState
          icon={TagIcon}
          title="No pricing plans yet"
          description="Create a plan to set what visitors pay, then point a vehicle type at it."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-5">
            <KpiTile
              label="Plans"
              value={plans.length}
              caption={`${plans.length - stats.unused} in use · ${stats.unused} unused`}
            />
            <KpiTile
              label="Vehicle types priced"
              value={stats.priced}
              caption={`of ${vehicleTypes.length} total`}
            />
            <KpiTile
              label="With a minimum"
              value={stats.withMinimum}
              caption="Charge floor once billable"
            />
            <KpiTile
              label="With a night rate"
              value={stats.withNightRate}
              caption={
                nightEnabled === false
                  ? 'Night pricing is off'
                  : configData
                    ? `Billed ${nightWindowLabel(configData)}`
                    : 'Billed inside the night window'
              }
            />
            <KpiTile
              className="col-span-2 lg:col-span-1"
              label="Needs attention"
              value={stats.incomplete}
              caption={stats.incomplete ? 'Plans that charge nothing' : 'All plans have rates'}
            />
          </div>

          {configData && (
            <NightPricingCard
              key={`${configData.night_pricing_enabled}-${configData.night_start}-${configData.night_end}-${configData.night_morning_grace_minutes}-${configData.night_evening_grace_minutes}`}
              config={configData}
            />
          )}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase text-muted-foreground">
                  <th className="px-3 py-2.5">Plan</th>
                  <th className="px-3 py-2.5">Rate</th>
                  <th className="px-3 py-2.5">
                    Night rate
                    {configData && nightEnabled && (
                      <span className="ml-1 normal-case font-normal">({nightWindowLabel(configData)})</span>
                    )}
                  </th>
                  <th className="px-3 py-2.5">Minimum</th>
                  <th className="px-3 py-2.5">Used by</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => {
                  const usedBy = typesByPlanId.get(plan.id) ?? NONE;
                  const warning = planWarning(plan);
                  return (
                    <tr key={plan.id} className="border-b border-border last:border-0 align-top">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-foreground">{plan.name}</div>
                        <Badge variant="secondary" className="mt-1 text-[10.5px]">
                          {planTypeLabel(plan.plan_type)}
                        </Badge>
                        {warning && (
                          <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                            <span>{warning}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-foreground">
                        {rateSummary(plan, currency)}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[13px] tabular-nums text-foreground">
                        {hasNightRate(plan) ? (
                          <span className={nightEnabled === false ? 'text-muted-foreground line-through' : undefined}>
                            {formatMoney(plan.night_rate_per_hour, currency)} / hour
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Same as day</span>
                        )}
                        {hasNightRate(plan) && nightEnabled === false && (
                          <div className="font-sans text-[11px] text-muted-foreground">Night pricing off</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[13px] tabular-nums text-foreground">
                        {Number(plan.minimum_charge ?? 0) > 0 ? (
                          formatMoney(plan.minimum_charge, currency)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {usedBy.length === 0 ? (
                          <span className="text-[12.5px] text-muted-foreground">Not used yet</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {usedBy.map((vt) => (
                              <Badge key={vt.id} variant="outline" className="text-[10.5px]">
                                {vt.name} · {vt.category === 'CAR' ? 'Car' : 'Bike'}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${plan.name}`}
                            onClick={() => openEdit(plan)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${plan.name}`}
                            disabled={usedBy.length > 0}
                            title={
                              usedBy.length > 0
                                ? 'Move its vehicle types to another plan first'
                                : undefined
                            }
                            onClick={() => setPendingDelete(plan)}
                          >
                            <Trash2
                              className={
                                usedBy.length > 0 ? 'h-3.5 w-3.5' : 'h-3.5 w-3.5 text-destructive'
                              }
                            />
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

      <PricingPlanDialog
        mode={dialogMode}
        plan={activePlan}
        currency={currency}
        nightConfig={configData}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        busy={deleting}
        title={`Delete ${pendingDelete?.name ?? 'plan'}?`}
        description="This pricing plan will be removed permanently. Charges already calculated are unaffected."
        confirmLabel="Delete plan"
        onOpenChange={(next) => { if (!next) setPendingDelete(null); }}
        onConfirm={confirmDelete}
      />
    </PageShell>
  );
};

export default PricingPlansPage;
