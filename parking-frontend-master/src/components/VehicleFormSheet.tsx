import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { toast } from 'react-toastify';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useGetVendorsQuery,
  useGetVehicleTypesQuery,
  useCreateStaffMutation,
} from '@/app/(public)/(pages)/home/_redux/api';

interface Vendor {
  id: number;
  name: string;
  car_quota: number;
  bike_quota: number;
}

interface VehicleType {
  id: number;
  name: string;
  category: 'CAR' | 'BIKE';
}

const schema = yup.object({
  name: yup.string().trim().required('Name is required'),
  license_plate: yup.string().trim().required('License plate is required'),
  company_id: yup
    .number()
    .typeError('Select a tenant')
    .required('Select a tenant'),
  vehicle_type_id: yup
    .number()
    .typeError('Select a vehicle type')
    .required('Select a vehicle type'),
});

type FormValues = yup.InferType<typeof schema>;

const selectClassName =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 w-full';

interface VehicleFormSheetProps {
  // Pre-selects the tenant when registering from inside a tenant's member
  // list, so the operator doesn't re-pick the tenant they just drilled into.
  defaultCompanyId?: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

// Registration only — editing an existing vehicle happens inside the member
// card popup (components/tenants/MemberCardDialog).
export function VehicleFormSheet({ defaultCompanyId, open, onOpenChange, onSaved }: VehicleFormSheetProps) {
  const { data: vendors = [] } = useGetVendorsQuery(undefined) as { data: Vendor[] };
  const { data: vehicleTypes = [] } = useGetVehicleTypesQuery(undefined) as { data: VehicleType[] };
  const [createStaff, { isLoading: creating }] = useCreateStaffMutation();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { name: '', license_plate: '', company_id: undefined, vehicle_type_id: undefined },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: '',
      license_plate: '',
      company_id: defaultCompanyId ?? undefined,
      vehicle_type_id: undefined,
    });
  }, [open, defaultCompanyId, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      await createStaff(values).unwrap();
      toast.success('Vehicle registered');
      onSaved();
    } catch {
      // Global axios interceptor already toasts DRF validation errors
      // (including quota-exceeded) — keep the sheet open so the operator
      // can correct and resubmit.
    }
  };


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Register vehicle</SheetTitle>
          <SheetDescription>
            Adds a parking card for a tenant's staff member. Blocked if the tenant is already at its car/bike quota.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Name</label>
            <Input {...register('name')} placeholder="e.g. Ram Shrestha" />
            {errors.name && <p className="text-[11px] text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">License plate</label>
            <Input
              {...register('license_plate')}
              placeholder="e.g. BA 1 PA 1234"
              onChange={(e) => setValue('license_plate', e.target.value.toUpperCase(), { shouldValidate: true })}
            />
            {errors.license_plate && (
              <p className="text-[11px] text-destructive">{errors.license_plate.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Tenant</label>
            <select className={selectClassName} {...register('company_id', { valueAsNumber: true })}>
              <option value="">Select a tenant…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.car_quota} car / {v.bike_quota} bike
                </option>
              ))}
            </select>
            {errors.company_id && (
              <p className="text-[11px] text-destructive">{errors.company_id.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Vehicle type</label>
            <select className={selectClassName} {...register('vehicle_type_id', { valueAsNumber: true })}>
              <option value="">Select a vehicle type…</option>
              {vehicleTypes.map((vt) => (
                <option key={vt.id} value={vt.id}>
                  {vt.name} ({vt.category === 'CAR' ? 'Car' : 'Bike'})
                </option>
              ))}
            </select>
            {errors.vehicle_type_id && (
              <p className="text-[11px] text-destructive">{errors.vehicle_type_id.message}</p>
            )}
          </div>

          <SheetFooter className="mt-auto px-0">
            <Button type="submit" disabled={creating}>
              {creating ? 'Saving…' : 'Register vehicle'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
