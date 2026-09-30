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
import { Switch } from '@/components/ui/switch';
import {
  useCreateOperatorMutation,
  useUpdateOperatorMutation,
} from '@/app/(public)/(pages)/operators/_redux/api';
import { OPERATOR_ROLES, type Operator, type OperatorRole } from '@/components/operators/types';
import { useGetVendorsQuery } from '@/app/(public)/(pages)/home/_redux/api';
import { ROLE_TENANT } from '@/lib/public/roles';

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

const labelClassName =
  'text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase';

const buildSchema = (mode: 'create' | 'edit') =>
  yup.object({
    email: yup.string().trim().email('Enter a valid email').required('Email is required'),
    phone_no: yup.string().trim().optional(),
    role: yup
      .mixed<OperatorRole>()
      .oneOf(OPERATOR_ROLES.map((r) => r.value))
      .required('Select a role'),
    is_active: yup.boolean().required(),
    vendor: yup
      .string()
      .default('')
      .when('role', {
        is: ROLE_TENANT,
        then: (schema) => schema.required('Select the tenant this login belongs to'),
      }),
    password:
      mode === 'create'
        ? yup.string().min(8, 'At least 8 characters').required('Password is required')
        : yup.string().transform((v) => (v ? v : undefined)).min(8, 'At least 8 characters').optional(),
  });

type FormValues = yup.InferType<ReturnType<typeof buildSchema>>;

interface OperatorDialogProps {
  mode: 'create' | 'edit';
  operator: Operator | null;
  isSelf: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULTS: FormValues = {
  email: '',
  phone_no: '',
  role: 'pos',
  is_active: true,
  password: '',
  vendor: '',
};

export function OperatorDialog({ mode, operator, isSelf, open, onOpenChange }: OperatorDialogProps) {
  const [createOperator, { isLoading: creating }] = useCreateOperatorMutation();
  const [updateOperator, { isLoading: updating }] = useUpdateOperatorMutation();
  const { data: vendors = [] } = useGetVendorsQuery(undefined, { skip: !open });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: yupResolver(buildSchema(mode)),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && operator) {
      reset({
        email: operator.email,
        phone_no: operator.phone_no ?? '',
        role: operator.role ?? 'pos',
        is_active: operator.is_active,
        password: '',
        vendor: operator.vendor ? String(operator.vendor) : '',
      });
    } else {
      reset(DEFAULTS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, operator]);

  const isActive = watch('is_active');

  const onSubmit = async (values: FormValues) => {
    const payload: Record<string, unknown> = {
      email: values.email.trim(),
      phone_no: values.phone_no?.trim() || null,
      role: values.role,
      is_active: values.is_active,
      vendor: values.role === ROLE_TENANT && values.vendor ? Number(values.vendor) : null,
    };
    if (values.password) payload.password = values.password;

    try {
      if (mode === 'create') {
        await createOperator(payload).unwrap();
        toast.success('Operator created');
      } else if (operator) {
        await updateOperator({ id: operator.id, ...payload }).unwrap();
        toast.success('Operator updated');
      }
      onOpenChange(false);
    } catch {
      // Interceptor toasts the DRF error (duplicate email, self-lockout guard, …).
    }
  };

  const submitting = creating || updating;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting || next) onOpenChange(next); }}>
      <DialogContent showCloseButton={!submitting} className="max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'New operator' : 'Edit operator'}</DialogTitle>
            <DialogDescription>
              An operator is a login for the parking desk, granted one of the roles below.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-5 py-4">
            <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2 sm:gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className={labelClassName}>Email</label>
                <Input type="email" {...register('email')} placeholder="name@example.com" />
                {errors.email && <p className="text-[11px] text-destructive">{errors.email.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelClassName}>Phone (optional)</label>
                <Input {...register('phone_no')} placeholder="e.g. 98XXXXXXXX" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClassName}>Role</label>
              <select className={selectClassName} disabled={isSelf} {...register('role')}>
                {OPERATOR_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="text-[11.5px] text-muted-foreground">
                {isSelf
                  ? "You can't change your own role."
                  : OPERATOR_ROLES.find((r) => r.value === watch('role'))?.hint}
              </p>
            </div>

            {watch('role') === ROLE_TENANT && (
              <div className="flex flex-col gap-1.5">
                <label className={labelClassName}>Tenant</label>
                <select className={selectClassName} {...register('vendor')}>
                  <option value="">Select a tenant…</option>
                  {(vendors as { id: number; name: string }[]).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                {errors.vendor && <p className="text-[11px] text-destructive">{errors.vendor.message}</p>}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className={labelClassName}>
                {mode === 'create' ? 'Password' : 'New password (optional)'}
              </label>
              <Input type="password" {...register('password')} placeholder={mode === 'create' ? 'At least 8 characters' : 'Leave blank to keep current password'} />
              {errors.password && (
                <p className="text-[11px] text-destructive">{errors.password.message}</p>
              )}
            </div>

            {mode === 'edit' && (
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <div>
                  <p className="text-[13px] font-medium text-foreground">Active</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {isSelf ? "You can't deactivate your own account." : 'Inactive operators can no longer log in.'}
                  </p>
                </div>
                <Switch
                  checked={isActive}
                  disabled={isSelf}
                  onCheckedChange={(checked) => setValue('is_active', checked)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <span className="text-[11.5px] text-muted-foreground">Operator emails must be unique.</span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : mode === 'create' ? 'Create operator' : 'Save changes'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
