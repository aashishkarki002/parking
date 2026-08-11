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
import { Switch } from '@/components/ui/switch';
import {
  useGetVendorsQuery,
  useGetVehicleTypesQuery,
  useCreateStaffMutation,
  useUpdateStaffMutation,
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

interface StaffRecord {
  id: number;
  name: string;
  company: string | null;
  license_plate: string;
  vehicle_type: string | null;
  is_card_active: boolean;
  card_code?: string;
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
  mode: 'create' | 'edit';
  staff: StaffRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function VehicleFormSheet({ mode, staff, open, onOpenChange, onSaved }: VehicleFormSheetProps) {
  const { data: vendors = [] } = useGetVendorsQuery(undefined) as { data: Vendor[] };
  const { data: vehicleTypes = [] } = useGetVehicleTypesQuery(undefined) as { data: VehicleType[] };
  const [createStaff, { isLoading: creating }] = useCreateStaffMutation();
  const [updateStaff, { isLoading: updating }] = useUpdateStaffMutation();

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

  // Edit mode: company_id/vehicle_type_id are write_only on the API (never
  // returned by GET), so resolve the current selection by matching the
  // unique `name` field against the loaded vendor/vehicle-type lists.
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && staff) {
      const vendor = vendors.find((v) => v.name === staff.company);
      const vehicleType = vehicleTypes.find((vt) => vt.name === staff.vehicle_type);
      reset({
        name: staff.name,
        license_plate: staff.license_plate,
        company_id: vendor?.id,
        vehicle_type_id: vehicleType?.id,
      });
    } else {
      reset({ name: '', license_plate: '', company_id: undefined, vehicle_type_id: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, staff, vendors, vehicleTypes]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (mode === 'create') {
        await createStaff(values).unwrap();
        toast.success('Vehicle registered');
      } else if (staff) {
        await updateStaff({ id: staff.id, ...values }).unwrap();
        toast.success('Vehicle updated');
      }
      onSaved();
    } catch {
      // Global axios interceptor already toasts DRF validation errors
      // (including quota-exceeded) — keep the sheet open so the operator
      // can correct and resubmit.
    }
  };

  const handleCardToggle = async (checked: boolean) => {
    if (!staff) return;
    try {
      await updateStaff({ id: staff.id, is_card_active: checked }).unwrap();
      toast.success(checked ? 'Card reactivated' : 'Card deactivated');
      onSaved();
    } catch {
      // interceptor handles the error toast
    }
  };

  const submitting = creating || updating;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{mode === 'create' ? 'Register vehicle' : 'Vehicle detail'}</SheetTitle>
          <SheetDescription>
            {mode === 'create'
              ? "Adds a parking card for a tenant's staff member. Blocked if the tenant is already at its car/bike quota."
              : 'Edit this vehicle, or deactivate its card if lost.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
          {mode === 'edit' && staff?.card_code && (
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-xs font-medium">Card active</p>
                <p className="text-[11px] text-muted-foreground font-mono">{staff.card_code}</p>
              </div>
              <Switch checked={staff.is_card_active} onCheckedChange={handleCardToggle} />
            </div>
          )}

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
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : mode === 'create' ? 'Register vehicle' : 'Save changes'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
