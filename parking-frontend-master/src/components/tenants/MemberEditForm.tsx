import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { toast } from 'react-toastify';
import {
  useGetVehicleTypesQuery,
  useGetVendorsQuery,
  useUpdateStaffMutation,
} from '@/app/(public)/(pages)/home/_redux/api';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TenantMember, VehicleCategory } from '@/components/tenants/types';

interface VendorOption {
  id: number;
  name: string;
  car_quota: number;
  bike_quota: number;
}

interface VehicleTypeOption {
  id: number;
  name: string;
  category: VehicleCategory;
}

const schema = yup.object({
  name: yup.string().trim().required('Name is required'),
  license_plate: yup.string().trim().required('License plate is required'),
  company_id: yup.number().typeError('Select a tenant').required('Select a tenant'),
  vehicle_type_id: yup.number().typeError('Select a vehicle type').required('Select a vehicle type'),
});

type FormValues = yup.InferType<typeof schema>;

interface MemberEditFormProps {
  // Referenced by the dialog footer's submit button, which sits outside the
  // scroll area (and so outside this <form>).
  formId: string;
  member: TenantMember;
  onSaved: () => void;
  onSubmittingChange: (submitting: boolean) => void;
}

// Inline edit form for the member card popup. company_id/vehicle_type_id are
// write_only on the API (never returned by GET), so the current selection is
// resolved by matching the unique `name` fields against the loaded lists.
export function MemberEditForm({ formId, member, onSaved, onSubmittingChange }: MemberEditFormProps) {
  const { data: vendors = [] } = useGetVendorsQuery(undefined) as { data: VendorOption[] };
  const { data: vehicleTypes = [] } = useGetVehicleTypesQuery(undefined) as { data: VehicleTypeOption[] };
  const [updateStaff, { isLoading }] = useUpdateStaffMutation();

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: yupResolver(schema) });

  useEffect(() => {
    reset({
      name: member.name,
      license_plate: member.license_plate,
      company_id: vendors.find((v) => v.name === member.company)?.id,
      vehicle_type_id: vehicleTypes.find((vt) => vt.name === member.vehicle_type)?.id,
    });
  }, [member, vendors, vehicleTypes, reset]);

  useEffect(() => {
    onSubmittingChange(isLoading);
  }, [isLoading, onSubmittingChange]);

  const onSubmit = async (values: FormValues) => {
    try {
      await updateStaff({ id: member.id, ...values }).unwrap();
      toast.success('Vehicle updated');
      onSaved();
    } catch {
      // Global axios interceptor already toasts DRF validation errors
      // (including quota-exceeded) — stay in edit mode so it can be fixed.
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3.5">
      <div className="space-y-1.5">
        <label htmlFor={`${formId}-name`} className="text-xs font-medium text-foreground">
          Name
        </label>
        <Input id={`${formId}-name`} {...register('name')} placeholder="e.g. Ram Shrestha" autoFocus />
        {errors.name && <p className="text-[11px] text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${formId}-plate`} className="text-xs font-medium text-foreground">
          License plate
        </label>
        <Input
          id={`${formId}-plate`}
          {...register('license_plate')}
          placeholder="e.g. BA 1 PA 1234"
          className="font-mono"
          onChange={(e) => setValue('license_plate', e.target.value.toUpperCase(), { shouldValidate: true })}
        />
        {errors.license_plate && <p className="text-[11px] text-destructive">{errors.license_plate.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <span className="text-xs font-medium text-foreground">Tenant</span>
          <Controller
            control={control}
            name="company_id"
            render={({ field }) => (
              <Select
                value={field.value != null ? String(field.value) : null}
                onValueChange={(value) => field.onChange(Number(value))}
              >
                <SelectTrigger className="w-full" aria-invalid={Boolean(errors.company_id)}>
                  <SelectValue placeholder="Select a tenant…">
                    {(value: string | null) => vendors.find((v) => String(v.id) === value)?.name ?? 'Select a tenant…'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.name} — {v.car_quota} car / {v.bike_quota} bike
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.company_id && <p className="text-[11px] text-destructive">{errors.company_id.message}</p>}
        </div>

        <div className="min-w-0 space-y-1.5">
          <span className="text-xs font-medium text-foreground">Vehicle type</span>
          <Controller
            control={control}
            name="vehicle_type_id"
            render={({ field }) => (
              <Select
                value={field.value != null ? String(field.value) : null}
                onValueChange={(value) => field.onChange(Number(value))}
              >
                <SelectTrigger className="w-full" aria-invalid={Boolean(errors.vehicle_type_id)}>
                  <SelectValue placeholder="Select a vehicle type…">
                    {(value: string | null) =>
                      vehicleTypes.find((vt) => String(vt.id) === value)?.name ?? 'Select a vehicle type…'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {vehicleTypes.map((vt) => (
                    <SelectItem key={vt.id} value={String(vt.id)}>
                      {vt.name} ({vt.category === 'CAR' ? 'Car' : 'Bike'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.vehicle_type_id && (
            <p className="text-[11px] text-destructive">{errors.vehicle_type_id.message}</p>
          )}
        </div>
      </div>
    </form>
  );
}
