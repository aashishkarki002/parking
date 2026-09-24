import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { toast } from 'react-toastify';
import { Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useCreatePricingPlanMutation,
  useUpdatePricingPlanMutation,
} from '@/app/(public)/(pages)/settings/_redux/api';
import { PLAN_TYPES, sortedTiers, type PlanType, type PricingPlan } from '@/components/settings/types';

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

const labelClassName =
  'text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase';

const schema = yup.object({
  name: yup.string().trim().required('Name is required'),
  plan_type: yup
    .mixed<PlanType>()
    .oneOf(['HOURLY', 'FLAT_RATE_PER_DAY', 'TIERED_HOURLY'])
    .required(),
  minimum_charge: yup
    .number()
    .typeError('Enter a number')
    .min(0, 'Cannot be negative')
    .required('Minimum charge is required'),
  rate_per_hour: yup
    .number()
    .typeError('Enter a number')
    .min(0, 'Cannot be negative')
    .when('plan_type', {
      is: 'HOURLY',
      then: (s) => s.moreThan(0, 'Set a rate above 0').required('Rate is required'),
      otherwise: (s) => s.optional(),
    }),
  rate_per_day: yup
    .number()
    .typeError('Enter a number')
    .min(0, 'Cannot be negative')
    .when('plan_type', {
      is: 'FLAT_RATE_PER_DAY',
      then: (s) => s.moreThan(0, 'Set a rate above 0').required('Rate is required'),
      otherwise: (s) => s.optional(),
    }),
  tiers: yup
    .array(
      yup.object({
        up_to_hours: yup
          .number()
          .typeError('Enter a number')
          .moreThan(0, 'Must be above 0')
          .required('Required'),
        rate: yup
          .number()
          .typeError('Enter a number')
          .min(0, 'Cannot be negative')
          .required('Required'),
      })
    )
    .when('plan_type', {
      is: 'TIERED_HOURLY',
      then: (s) => s.min(1, 'Add at least one tier'),
      otherwise: (s) => s.optional(),
    })
    .required(),
});

type FormValues = yup.InferType<typeof schema>;

const emptyValues: FormValues = {
  name: '',
  plan_type: 'HOURLY',
  minimum_charge: 0,
  rate_per_hour: 0,
  rate_per_day: 0,
  tiers: [],
};

interface PricingPlanDialogProps {
  mode: 'create' | 'edit';
  plan: PricingPlan | null;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PricingPlanDialog({ mode, plan, currency, open, onOpenChange }: PricingPlanDialogProps) {
  const [createPlan, { isLoading: creating }] = useCreatePricingPlanMutation();
  const [updatePlan, { isLoading: updating }] = useUpdatePricingPlanMutation();

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: emptyValues,
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'tiers' });
  const planType = watch('plan_type');

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && plan) {
      const details = plan.rate_details ?? {};
      reset({
        name: plan.name,
        plan_type: plan.plan_type,
        minimum_charge: Number(plan.minimum_charge ?? 0),
        rate_per_hour: Number(details.rate_per_hour ?? 0),
        rate_per_day: Number(details.rate_per_day ?? 0),
        tiers: sortedTiers(details).map((tier) => ({
          up_to_hours: Number(tier.up_to_hours),
          rate: Number(tier.rate),
        })),
      });
    } else {
      reset(emptyValues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, plan]);

  // Only the keys the backend's calculator reads for the selected plan type are
  // sent, so switching a plan's type doesn't leave a stale rate behind.
  const buildRateDetails = (values: FormValues) => {
    if (values.plan_type === 'HOURLY') {
      return { rate_per_hour: String(values.rate_per_hour ?? 0) };
    }
    if (values.plan_type === 'FLAT_RATE_PER_DAY') {
      return { rate_per_day: String(values.rate_per_day ?? 0) };
    }
    return {
      tiers: [...values.tiers]
        .sort((a, b) => a.up_to_hours - b.up_to_hours)
        .map((tier) => ({ up_to_hours: tier.up_to_hours, rate: String(tier.rate) })),
    };
  };

  const onSubmit = async (values: FormValues) => {
    const payload = {
      name: values.name.trim(),
      plan_type: values.plan_type,
      minimum_charge: String(values.minimum_charge),
      rate_details: buildRateDetails(values),
    };

    try {
      if (mode === 'create') {
        await createPlan(payload).unwrap();
        toast.success('Pricing plan created');
      } else if (plan) {
        await updatePlan({ id: plan.id, ...payload }).unwrap();
        toast.success('Pricing plan updated');
      }
      onOpenChange(false);
    } catch {
      // The axios interceptor already toasts DRF validation errors (e.g. a
      // duplicate plan name) — keep the dialog open so it can be corrected.
    }
  };

  const submitting = creating || updating;
  const typeHint = PLAN_TYPES.find((p) => p.value === planType)?.hint;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting || next) onOpenChange(next); }}>
      <DialogContent showCloseButton={!submitting} className="max-w-xl">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'New pricing plan' : 'Edit pricing plan'}</DialogTitle>
            <DialogDescription>
              Plans decide what a visitor pays. Vehicle types point at a plan, so editing one
              re-prices every vehicle type using it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2 sm:gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className={labelClassName}>Plan name</label>
                <Input {...register('name')} placeholder="e.g. Standard hourly" />
                {errors.name && <p className="text-[11px] text-destructive">{errors.name.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelClassName}>Plan type</label>
                <select className={selectClassName} {...register('plan_type')}>
                  {PLAN_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {typeHint && <p className="text-[11.5px] text-muted-foreground">{typeHint}</p>}

            {planType === 'HOURLY' && (
              <div className="flex flex-col gap-1.5 sm:max-w-[50%]">
                <label className={labelClassName}>Rate per hour ({currency})</label>
                <Input type="number" step="0.01" min="0" {...register('rate_per_hour')} />
                {errors.rate_per_hour && (
                  <p className="text-[11px] text-destructive">{errors.rate_per_hour.message}</p>
                )}
              </div>
            )}

            {planType === 'FLAT_RATE_PER_DAY' && (
              <div className="flex flex-col gap-1.5 sm:max-w-[50%]">
                <label className={labelClassName}>Rate per day ({currency})</label>
                <Input type="number" step="0.01" min="0" {...register('rate_per_day')} />
                {errors.rate_per_day && (
                  <p className="text-[11px] text-destructive">{errors.rate_per_day.message}</p>
                )}
              </div>
            )}

            {planType === 'TIERED_HOURLY' && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className={labelClassName}>Tiers</label>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => append({ up_to_hours: 1, rate: 0 })}
                  >
                    <Plus className="h-3 w-3" />
                    Add tier
                  </Button>
                </div>

                {fields.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">
                    No tiers yet. Add one bracket per price step.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex items-end gap-2">
                        <div className="flex flex-1 flex-col gap-1.5">
                          <label className="text-[10.5px] text-muted-foreground">Up to (hours)</label>
                          <Input
                            type="number"
                            step="0.5"
                            min="0"
                            {...register(`tiers.${index}.up_to_hours` as const)}
                          />
                          {errors.tiers?.[index]?.up_to_hours && (
                            <p className="text-[11px] text-destructive">
                              {errors.tiers[index]?.up_to_hours?.message}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-1.5">
                          <label className="text-[10.5px] text-muted-foreground">
                            Rate per hour ({currency})
                          </label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            {...register(`tiers.${index}.rate` as const)}
                          />
                          {errors.tiers?.[index]?.rate && (
                            <p className="text-[11px] text-destructive">
                              {errors.tiers[index]?.rate?.message}
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove tier ${index + 1}`}
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {typeof errors.tiers?.message === 'string' && (
                  <p className="text-[11px] text-destructive">{errors.tiers.message}</p>
                )}
                <p className="text-[11.5px] text-muted-foreground">
                  Each tier covers the time between the previous tier's limit and its own. Anything
                  past the last tier keeps charging that tier's rate.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-1.5 sm:max-w-[50%]">
              <label className={labelClassName}>Minimum charge ({currency})</label>
              <Input type="number" step="0.01" min="0" {...register('minimum_charge')} />
              {errors.minimum_charge && (
                <p className="text-[11px] text-destructive">{errors.minimum_charge.message}</p>
              )}
              <p className="text-[11.5px] text-muted-foreground">
                Floor applied once a session is chargeable at all. Leave at 0 for no minimum.
              </p>
            </div>
          </div>

          <DialogFooter>
            <span className="text-[11.5px] text-muted-foreground">
              {mode === 'create' ? 'Plan names must be unique.' : 'Changes apply to new charges only.'}
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : mode === 'create' ? 'Create plan' : 'Save changes'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
