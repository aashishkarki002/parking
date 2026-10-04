import { useEffect, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { toast } from 'react-toastify';
import { Lock } from 'lucide-react';
import { useUpdateVendorMutation } from '@/app/(public)/(pages)/home/_redux/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatDate } from '@/functions/dateFn';
import { GatePill } from '@/components/tenants/primitives';
import type { Vendor } from '@/components/tenants/types';

// A blank number input means "use the global default" (null on the API), not 0.
const optionalMinutes = yup
  .number()
  .transform((value, original) => (original === '' || original === null ? null : value))
  .typeError('Enter a whole number')
  .integer('Enter a whole number')
  .min(0, 'Cannot be negative')
  .nullable()
  .defined();

const schema = yup.object({
  name: yup.string().trim().required('Name is required').max(150),
  location: yup.string().trim().max(200).defined(),
  contact_person: yup.string().trim().max(100).defined(),
  contact_email: yup.string().trim().email('Enter a valid email').defined(),
  stamp_free_minutes: yup
    .number()
    .typeError('Enter a whole number')
    .integer('Enter a whole number')
    .min(0, 'Cannot be negative')
    .required('Required'),
  tenant_free_hours: optionalMinutes.max(24, 'At most 24 hours'),
  student_early_grace_minutes: optionalMinutes,
  student_late_grace_minutes: optionalMinutes,
});

type FormValues = yup.InferType<typeof schema>;

interface TenantEditSheetProps {
  vendor: Vendor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Edits the fields Django owns. Quota and gate access are cached from
// EasyManage (read-only on the serializer), so they're shown — locked — for
// context rather than hidden, which would leave people hunting for them.
export function TenantEditSheet({ vendor, open, onOpenChange }: TenantEditSheetProps) {
  const [updateVendor, { isLoading }] = useUpdateVendorMutation();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: yupResolver(schema) });

  useEffect(() => {
    if (!vendor || !open) return;
    reset({
      name: vendor.name,
      location: vendor.location ?? '',
      contact_person: vendor.contact_person ?? '',
      contact_email: vendor.contact_email ?? '',
      stamp_free_minutes: vendor.stamp_free_minutes,
      tenant_free_hours: vendor.tenant_free_hours ?? null,
      student_early_grace_minutes: vendor.student_early_grace_minutes ?? null,
      student_late_grace_minutes: vendor.student_late_grace_minutes ?? null,
    });
  }, [vendor, open, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!vendor) return;
    try {
      await updateVendor({ id: vendor.id, ...values }).unwrap();
      toast.success(`${values.name} updated`);
      onOpenChange(false);
    } catch (err) {
      const data = (err as { data?: Record<string, unknown> })?.data;
      const first = data && Object.values(data).flat()[0];
      toast.error(typeof first === 'string' ? first : 'Could not update tenant');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Edit tenant</SheetTitle>
          <SheetDescription>Contact details and parking allowances for {vendor?.name ?? 'this tenant'}.</SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-1 flex-col gap-6 overflow-y-auto px-4"
        >
          <Section title="Details">
            <Field label="Name" error={errors.name?.message}>
              <Input {...register('name')} autoComplete="organization" />
            </Field>
            <Field label="Location" error={errors.location?.message}>
              <Input {...register('location')} placeholder="e.g. Level 2, Unit 204" />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Contact person" error={errors.contact_person?.message}>
                <Input {...register('contact_person')} autoComplete="name" />
              </Field>
              <Field label="Contact email" error={errors.contact_email?.message}>
                <Input {...register('contact_email')} type="email" autoComplete="email" />
              </Field>
            </div>
          </Section>

          <Section title="Allowances">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Per stamp" suffix="min" error={errors.stamp_free_minutes?.message}>
                <Input {...register('stamp_free_minutes')} type="number" inputMode="numeric" min={0} />
              </Field>
              <Field label="Free parking" suffix="hrs" error={errors.tenant_free_hours?.message}>
                <Input
                  {...register('tenant_free_hours')}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={24}
                  placeholder="Default"
                />
              </Field>
              <Field label="Student early grace" suffix="min" error={errors.student_early_grace_minutes?.message}>
                <Input
                  {...register('student_early_grace_minutes')}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="Default"
                />
              </Field>
              <Field label="Student late grace" suffix="min" error={errors.student_late_grace_minutes?.message}>
                <Input
                  {...register('student_late_grace_minutes')}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="Default"
                />
              </Field>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Leave a field blank to use the global default from Parking Configuration.
            </p>
          </Section>

          {vendor && (
            <Section
              title={
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-3 w-3" />
                  Synced from EasyManage
                </span>
              }
            >
              <dl className="divide-y divide-border rounded-lg border border-border text-sm">
                <ReadonlyRow label="Car quota" value={vendor.car_quota || '—'} />
                <ReadonlyRow label="Bike quota" value={vendor.bike_quota || '—'} />
                <ReadonlyRow label="Gate access" value={<GatePill allowed={vendor.gate_access_allowed} />} />
                <ReadonlyRow
                  label="Last synced"
                  value={
                    vendor.last_synced_at
                      ? `${formatDate(vendor.last_synced_at)}${vendor.sync_source ? ` · ${vendor.sync_source}` : ''}`
                      : 'Never'
                  }
                />
              </dl>
              <p className="text-[11px] text-muted-foreground">
                Quota and gate access change in EasyManage and sync here automatically.
              </p>
            </Section>
          )}

          <SheetFooter className="sticky bottom-0 mt-auto -mx-4 border-t border-border bg-popover/80 px-4 backdrop-blur-md">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !isDirty}>
              {isLoading ? 'Saving…' : 'Save changes'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  suffix,
  error,
  children,
}: {
  label: string;
  suffix?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">
        {label}
        {suffix && <span className="font-normal text-muted-foreground"> ({suffix})</span>}
      </span>
      {children}
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </label>
  );
}

function ReadonlyRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
