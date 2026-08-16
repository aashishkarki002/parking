import { useEffect, useMemo, useState } from 'react';
import { Bike, Car, Check, Info, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  useCreateParkingPassMutation,
  useCreateStaffMutation,
  useGetVehicleTypesQuery,
  useGetVendorsQuery,
} from '@/app/(public)/(pages)/home/_redux/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface VehicleType {
  id: number;
  name: string;
}

interface Vendor {
  id: number;
  name: string;
}

type PermitKind = 'tenant' | 'monthly';

const selectClasses =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

const vehicleIconFor = (name: string) => (/bike|motor|scooter/i.test(name) ? Bike : Car);

const formatNRs = (amount: number) =>
  `NRs ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(amount))}`;

const emptyForm = {
  vehicleTypeId: '' as number | '',
  plate: '',
  name: '',
  email: '',
  companyId: '' as number | '',
  permitKind: 'tenant' as PermitKind,
  validUntil: '',
  pricePaid: '',
  notes: '',
};

interface RegisterVehicleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RegisterVehicleDialog({ open, onOpenChange }: RegisterVehicleDialogProps) {
  const [form, setForm] = useState(emptyForm);

  const { data: vehicleTypesData } = useGetVehicleTypesQuery(undefined, { skip: !open });
  const { data: vendorsData } = useGetVendorsQuery(undefined, { skip: !open });
  const vehicleTypes: VehicleType[] = vehicleTypesData ?? [];
  const vendors: Vendor[] = vendorsData ?? [];

  const [createStaff, { isLoading: isCreatingStaff }] = useCreateStaffMutation();
  const [createParkingPass, { isLoading: isCreatingPass }] = useCreateParkingPassMutation();
  const isSubmitting = isCreatingStaff || isCreatingPass;

  // Reset to a clean form each time the dialog opens.
  useEffect(() => {
    if (open) setForm(emptyForm);
  }, [open]);

  // Default to the first vehicle type once the list loads.
  useEffect(() => {
    if (open && vehicleTypes.length > 0 && form.vehicleTypeId === '') {
      setForm((f) => ({ ...f, vehicleTypeId: vehicleTypes[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vehicleTypes.length]);

  const isMonthly = form.permitKind === 'monthly';

  const priceValue = useMemo(() => {
    const n = Number(form.pricePaid);
    return Number.isFinite(n) ? n : 0;
  }, [form.pricePaid]);

  const canSubmit =
    form.plate.trim().length > 0 &&
    form.name.trim().length > 0 &&
    (!isMonthly || (form.validUntil.length > 0 && form.pricePaid.trim().length > 0));

  const handleClose = () => {
    if (isSubmitting) return;
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;

    try {
      const staff = await createStaff({
        name: form.name.trim(),
        license_plate: form.plate.trim().toUpperCase(),
        vehicle_type_id: form.vehicleTypeId || undefined,
        company_id: form.companyId || undefined,
        email: form.email.trim() || undefined,
      }).unwrap();

      if (isMonthly) {
        try {
          await createParkingPass({
            staff_id: staff.id,
            valid_from: new Date().toISOString(),
            valid_until: new Date(`${form.validUntil}T23:59:59`).toISOString(),
            price_paid: priceValue,
            notes: form.notes.trim(),
          }).unwrap();
        } catch {
          toast.warn(`${form.name}'s vehicle was registered, but the monthly pass could not be saved. Add it from the tenant's detail view.`);
          onOpenChange(false);
          return;
        }
      }

      toast.success(`${form.name}'s vehicle ${form.plate.trim().toUpperCase()} is registered.`);
      onOpenChange(false);
    } catch {
      // axios interceptor already surfaces the field error (e.g. duplicate plate) as a toast
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <DialogContent showCloseButton={!isSubmitting} className="max-w-xl">
        <form onSubmit={handleSubmit} className="flex flex-col">
          <DialogHeader>
            <DialogTitle>Register vehicle</DialogTitle>
            <DialogDescription>Issue a parking permit and link a vehicle to a tenant's card.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-5 py-4">
            <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2 sm:gap-3.5">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                  Vehicle type
                </label>
                <div className="flex flex-wrap gap-2">
                  {vehicleTypes.length === 0 && (
                    <span className="text-xs text-muted-foreground">No vehicle types configured yet.</span>
                  )}
                  {vehicleTypes.map((vt) => {
                    const Icon = vehicleIconFor(vt.name);
                    const active = form.vehicleTypeId === vt.id;
                    return (
                      <button
                        key={vt.id}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, vehicleTypeId: vt.id }))}
                        className={cn(
                          'inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-[13px] font-semibold transition-colors',
                          active
                            ? 'border-primary/30 bg-accent text-accent-foreground'
                            : 'border-border bg-card text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {vt.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                  Plate number
                </label>
                <Input
                  value={form.plate}
                  onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value.toUpperCase() }))}
                  placeholder="BA 1 PA 7788"
                  required
                  className="font-mono font-bold tracking-wide uppercase"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                  Tenant / owner name
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ms. Samita Tamang"
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-3 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground/80 uppercase">
              Permit
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2 sm:gap-3.5">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                  Permit type
                </label>
                <div className="flex gap-2">
                  {(
                    [
                      { key: 'tenant' as const, label: 'Tenant — included in lease' },
                      { key: 'monthly' as const, label: 'Monthly pass — paid' },
                    ]
                  ).map((opt) => {
                    const active = form.permitKind === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, permitKind: opt.key }))}
                        className={cn(
                          'inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors',
                          active
                            ? 'border-primary/30 bg-accent text-accent-foreground'
                            : 'border-border bg-card text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {active && <Check className="h-3.5 w-3.5" />}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                  Company / unit <span className="font-medium text-muted-foreground/70 normal-case">optional</span>
                </label>
                <select
                  value={form.companyId}
                  onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value ? Number(e.target.value) : '' }))}
                  className={selectClasses}
                >
                  <option value="">Unassigned</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                  Email <span className="font-medium text-muted-foreground/70 normal-case">optional</span>
                </label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="tenant@example.com"
                />
              </div>

              {isMonthly && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                      Pass valid until
                    </label>
                    <Input
                      type="date"
                      value={form.validUntil}
                      onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                      required={isMonthly}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                      Price paid (NRs)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={form.pricePaid}
                      onChange={(e) => setForm((f) => ({ ...f, pricePaid: e.target.value }))}
                      placeholder="3500"
                      required={isMonthly}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                      Notes <span className="font-medium text-muted-foreground/70 normal-case">optional</span>
                    </label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="Second vehicle for the same unit, uses spot only on weekends."
                      rows={2}
                      className="w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-accent px-3.5 py-3 text-[12px] leading-relaxed font-medium text-accent-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {isMonthly
                  ? 'A time-boxed pass is created for this vehicle. It stops granting gate access after the selected date unless renewed.'
                  : "Tenant permits don't expire — access continues for as long as the parking card stays active."}
              </span>
            </div>
          </div>

          <DialogFooter>
            <span className="text-xs font-medium text-muted-foreground">
              {isMonthly ? 'Pass price' : 'Included in lease'}
              <b className="mt-0.5 block font-mono text-base font-bold text-foreground tabular-nums">
                {isMonthly ? formatNRs(priceValue) : formatNRs(0)}
              </b>
            </span>
            <span className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Register vehicle
              </Button>
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
