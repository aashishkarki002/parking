import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { toast } from 'react-toastify';
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
  useCreateVehicleTypeMutation,
  useUpdateVehicleTypeMutation,
} from '@/app/(public)/(pages)/settings/_redux/api';
import {
  nightRateSummary,
  rateSummary,
  resolvePlan,
  type PricingPlan,
  type VehicleCategory,
  type VehicleType,
} from '@/components/settings/types';

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

const labelClassName =
  'text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase';

const schema = yup.object({
  name: yup.string().trim().required('Name is required'),
  category: yup.mixed<VehicleCategory>().oneOf(['CAR', 'BIKE']).required(),
  pricing_plan_id: yup
    .number()
    .typeError('Select a pricing plan')
    .required('Select a pricing plan'),
  free_duration_minutes: yup
    .number()
    .typeError('Enter a number')
    .integer('Whole minutes only')
    .min(0, 'Cannot be negative')
    .required('Free duration is required'),
});

type FormValues = yup.InferType<typeof schema>;

interface VehicleTypeDialogProps {
  mode: 'create' | 'edit';
  vehicleType: VehicleType | null;
  plans: PricingPlan[];
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VehicleTypeDialog({
  mode,
  vehicleType,
  plans,
  currency,
  open,
  onOpenChange,
}: VehicleTypeDialogProps) {
  const [createVehicleType, { isLoading: creating }] = useCreateVehicleTypeMutation();
  const [updateVehicleType, { isLoading: updating }] = useUpdateVehicleTypeMutation();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { name: '', category: 'CAR', pricing_plan_id: undefined, free_duration_minutes: 5 },
  });

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && vehicleType) {
      reset({
        name: vehicleType.name,
        category: vehicleType.category,
        pricing_plan_id: resolvePlan(plans, vehicleType)?.id,
        free_duration_minutes: vehicleType.free_duration_minutes,
      });
    } else {
      reset({ name: '', category: 'CAR', pricing_plan_id: undefined, free_duration_minutes: 5 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, vehicleType, plans]);

  const selectedPlan = plans.find((p) => p.id === Number(watch('pricing_plan_id')));

  const onSubmit = async (values: FormValues) => {
    const payload = { ...values, name: values.name.trim() };
    try {
      if (mode === 'create') {
        await createVehicleType(payload).unwrap();
        toast.success('Vehicle type created');
      } else if (vehicleType) {
        await updateVehicleType({ id: vehicleType.id, ...payload }).unwrap();
        toast.success('Vehicle type updated');
      }
      onOpenChange(false);
    } catch {
      // Interceptor toasts the DRF error (duplicate name, missing plan, …).
    }
  };

  const submitting = creating || updating;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting || next) onOpenChange(next); }}>
      <DialogContent showCloseButton={!submitting} className="max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'New vehicle type' : 'Edit vehicle type'}</DialogTitle>
            <DialogDescription>
              A vehicle type ties a category to a pricing plan and a free grace period.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-5 py-4">
            <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2 sm:gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className={labelClassName}>Name</label>
                <Input {...register('name')} placeholder="e.g. Car, Motorcycle" />
                {errors.name && <p className="text-[11px] text-destructive">{errors.name.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelClassName}>Category</label>
                <select className={selectClassName} {...register('category')}>
                  <option value="CAR">Car</option>
                  <option value="BIKE">Bike</option>
                </select>
                <p className="text-[11.5px] text-muted-foreground">
                  Decides which tenant quota (car or bike) this type counts against.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClassName}>Pricing plan</label>
              <select className={selectClassName} {...register('pricing_plan_id', { valueAsNumber: true })}>
                <option value="">Select a pricing plan…</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
              {errors.pricing_plan_id && (
                <p className="text-[11px] text-destructive">{errors.pricing_plan_id.message}</p>
              )}
              {selectedPlan && (
                <p className="text-[11.5px] text-muted-foreground">
                  {rateSummary(selectedPlan, currency)}
                  {nightRateSummary(selectedPlan, currency) && ` · ${nightRateSummary(selectedPlan, currency)}`}
                </p>
              )}
              {plans.length === 0 && (
                <p className="text-[11.5px] text-destructive">
                  No pricing plans exist yet — create one on the Pricing plans screen first.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5 sm:max-w-[50%]">
              <label className={labelClassName}>Free duration (minutes)</label>
              <Input type="number" step="1" min="0" {...register('free_duration_minutes')} />
              {errors.free_duration_minutes && (
                <p className="text-[11px] text-destructive">{errors.free_duration_minutes.message}</p>
              )}
              <p className="text-[11.5px] text-muted-foreground">
                Grace period before charging starts, on top of any coupon or tenant stamp minutes.
              </p>
            </div>
          </div>

          <DialogFooter>
            <span className="text-[11.5px] text-muted-foreground">Vehicle type names must be unique.</span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || plans.length === 0}>
                {submitting ? 'Saving…' : mode === 'create' ? 'Create type' : 'Save changes'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
