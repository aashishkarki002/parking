import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Check, Info, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { useCreateParkingPassMutation } from '@/app/(public)/(pages)/home/_redux/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { vehicleIconFor } from '@/functions/vehicleIcon';

const STANDARD_MONTHLY_RATE = 5000;

interface StaffOption {
  id: number;
  name: string;
  license_plate: string;
  vehicle_type: string | null;
}

interface AddSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffOptions: StaffOption[];
  eligibleStaffIds: Set<number>;
}

type Term = '1' | '3' | '6' | 'custom';

const formatNRs = (amount: number) =>
  `Rs. ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(amount))}`;

const emptyForm = {
  staffId: '' as number | '',
  term: '1' as Term,
  validFrom: dayjs().format('YYYY-MM-DD'),
  validUntil: '',
  pricePaid: String(STANDARD_MONTHLY_RATE),
  notes: '',
};

export function AddSubscriptionDialog({ open, onOpenChange, staffOptions, eligibleStaffIds }: AddSubscriptionDialogProps) {
  const [form, setForm] = useState(emptyForm);
  const [priceTouched, setPriceTouched] = useState(false);
  const [createParkingPass, { isLoading }] = useCreateParkingPassMutation();

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setPriceTouched(false);
    }
  }, [open]);

  const eligibleStaff = useMemo(
    () => staffOptions.filter((s) => eligibleStaffIds.has(s.id)),
    [staffOptions, eligibleStaffIds]
  );

  useEffect(() => {
    if (open && eligibleStaff.length > 0 && form.staffId === '') {
      setForm((f) => ({ ...f, staffId: eligibleStaff[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eligibleStaff.length]);

  const isCustom = form.term === 'custom';
  const termMonths = isCustom ? 0 : Number(form.term);

  const computedValidUntil = useMemo(() => {
    if (isCustom) return form.validUntil;
    const from = dayjs(form.validFrom || undefined);
    if (!from.isValid()) return '';
    return from.add(termMonths, 'month').format('YYYY-MM-DD');
  }, [isCustom, form.validFrom, form.validUntil, termMonths]);

  const customDays = useMemo(() => {
    if (!isCustom || !form.validFrom || !form.validUntil) return 0;
    return Math.max(0, dayjs(form.validUntil).diff(dayjs(form.validFrom), 'day'));
  }, [isCustom, form.validFrom, form.validUntil]);

  const suggestedPrice = isCustom
    ? Math.round((customDays / 30) * STANDARD_MONTHLY_RATE)
    : termMonths * STANDARD_MONTHLY_RATE;

  // Keep the price in sync with the term unless the staff member typed their own number.
  useEffect(() => {
    if (!priceTouched) setForm((f) => ({ ...f, pricePaid: String(suggestedPrice) }));
  }, [suggestedPrice, priceTouched]);

  const selectedStaff = staffOptions.find((s) => s.id === form.staffId) || null;
  const priceValue = Number(form.pricePaid);
  const priceValid = Number.isFinite(priceValue) && priceValue >= 0;

  const canSubmit =
    form.staffId !== '' &&
    form.validFrom.length > 0 &&
    computedValidUntil.length > 0 &&
    priceValid &&
    form.pricePaid.trim().length > 0;

  const handleClose = () => {
    if (isLoading) return;
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isLoading || !selectedStaff) return;

    try {
      await createParkingPass({
        staff_id: selectedStaff.id,
        valid_from: dayjs(form.validFrom).startOf('day').toISOString(),
        valid_until: dayjs(computedValidUntil).endOf('day').toISOString(),
        price_paid: priceValue,
        notes: form.notes.trim(),
      }).unwrap();
      toast.success(`Subscription pass issued to ${selectedStaff.name}.`);
      onOpenChange(false);
    } catch {
      // axios interceptor already surfaces field errors as a toast
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <DialogContent showCloseButton={!isLoading} className="max-w-xl">
        <form onSubmit={handleSubmit} className="flex flex-col">
          <DialogHeader>
            <DialogTitle>Add subscription pass</DialogTitle>
            <DialogDescription>
              Issue a monthly parking pass to a staff member. Standard rate — Rs. {STANDARD_MONTHLY_RATE.toLocaleString('en-IN')} per month.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-5 py-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">Staff member</label>
              {eligibleStaff.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Every registered tenant already holds an active pass. Renew from the table instead.
                </span>
              ) : (
                <Select
                  value={String(form.staffId)}
                  onValueChange={(value) => setForm((f) => ({ ...f, staffId: Number(value) }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a staff member">
                      {(value: string | null) => {
                        if (!value) return 'Choose a staff member';
                        const match = eligibleStaff.find((s) => String(s.id) === value);
                        return match ? `${match.name} — ${match.license_plate}` : value;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleStaff.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name} — {s.license_plate}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedStaff && (
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {(() => {
                    const Icon = vehicleIconFor(selectedStaff.vehicle_type || '');
                    return <Icon className="h-3.5 w-3.5" />;
                  })()}
                  {selectedStaff.vehicle_type || 'Vehicle'} · covers this one vehicle only
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground/80 uppercase">
              Term
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="flex flex-col gap-1.5">
              <ToggleGroup
                value={[form.term]}
                onValueChange={(values) => values[0] && setForm((f) => ({ ...f, term: values[0] as Term }))}
                className="w-full rounded-lg bg-muted/40 p-1"
              >
                <ToggleGroupItem value="1" className="flex-1 rounded-md">1 month</ToggleGroupItem>
                <ToggleGroupItem value="3" className="flex-1 rounded-md">3 months</ToggleGroupItem>
                <ToggleGroupItem value="6" className="flex-1 rounded-md">6 months</ToggleGroupItem>
                <ToggleGroupItem value="custom" className="flex-1 rounded-md">Custom dates</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">Valid from</label>
                <Input
                  type="date"
                  value={form.validFrom}
                  onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                  {isCustom ? 'Valid until' : 'Valid until (auto)'}
                </label>
                {isCustom ? (
                  <Input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                    min={form.validFrom}
                    required
                  />
                ) : (
                  <Input type="date" value={computedValidUntil} disabled />
                )}
                <span className="text-[11px] text-muted-foreground">
                  {isCustom ? 'Price pro-rates from the day count.' : 'Set by the selected term.'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground/80 uppercase">
              Payment
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">Price paid (Rs.)</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={form.pricePaid}
                  onChange={(e) => {
                    setPriceTouched(true);
                    setForm((f) => ({ ...f, pricePaid: e.target.value }));
                  }}
                  className="font-mono font-bold"
                  required
                />
                <span className="text-[11px] text-muted-foreground">Override for pro-rated or discounted passes.</span>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-1">
                <label className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                  Notes <span className="font-medium text-muted-foreground/70 normal-case">optional</span>
                </label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Second vehicle added mid-term; no extra charge."
                  rows={1}
                  className="h-[38px] resize-none"
                />
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-accent px-3.5 py-3 text-[12px] leading-relaxed font-medium text-accent-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Renewal is manual: this pass lapses on its end date and appears under Renewals due 14 days before.</span>
            </div>
          </div>

          <DialogFooter>
            <span className="text-xs font-medium text-muted-foreground">
              {isCustom ? 'Pro-rated total' : `${termMonths} ${termMonths === 1 ? 'month' : 'months'} × Rs. ${STANDARD_MONTHLY_RATE.toLocaleString('en-IN')}`}
              <b className="mt-0.5 block font-mono text-base font-bold text-foreground tabular-nums">
                {priceValid ? formatNRs(priceValue) : 'Rs. —'}
              </b>
            </span>
            <span className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit || isLoading}>
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Create pass
              </Button>
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
