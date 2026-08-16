import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { useGetVehicleTypesQuery, useScanCodeMutation } from '@/app/(public)/(pages)/home/_redux/api';
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
import { vehicleIconFor } from '@/functions/vehicleIcon';

interface VehicleType {
  id: number;
  name: string;
}

interface AddSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddSessionDialog({ open, onOpenChange }: AddSessionDialogProps) {
  const [vehicleTypeId, setVehicleTypeId] = useState<number | ''>('');
  const [plate, setPlate] = useState('');

  const { data: vehicleTypesData } = useGetVehicleTypesQuery(undefined, { skip: !open });
  const vehicleTypes: VehicleType[] = vehicleTypesData ?? [];
  const [scanCode, { isLoading }] = useScanCodeMutation();

  useEffect(() => {
    if (open) {
      setVehicleTypeId('');
      setPlate('');
    }
  }, [open]);

  useEffect(() => {
    if (open && vehicleTypes.length > 0 && vehicleTypeId === '') {
      setVehicleTypeId(vehicleTypes[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vehicleTypes.length]);

  const handleClose = () => {
    if (isLoading) return;
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleTypeId || isLoading) return;

    try {
      const res = await scanCode({
        vehicle_type_id: vehicleTypeId,
        license_plate: plate.trim() ? plate.trim().toUpperCase() : undefined,
      }).unwrap();
      toast.success(`Ticket ${res.ticket_number} opened.`);
      onOpenChange(false);
    } catch {
      // axios interceptor already surfaces field errors as a toast
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <DialogContent showCloseButton={!isLoading} className="max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col">
          <DialogHeader>
            <DialogTitle>Add parking session</DialogTitle>
            <DialogDescription>Open a new ticket for a vehicle entering now.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-5 py-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                Vehicle type
              </label>
              <div className="flex flex-wrap gap-2">
                {vehicleTypes.length === 0 && (
                  <span className="text-xs text-muted-foreground">No vehicle types configured yet.</span>
                )}
                {vehicleTypes.map((vt) => {
                  const Icon = vehicleIconFor(vt.name);
                  const active = vehicleTypeId === vt.id;
                  return (
                    <button
                      key={vt.id}
                      type="button"
                      onClick={() => setVehicleTypeId(vt.id)}
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
                Plate number <span className="font-medium text-muted-foreground/70 normal-case">optional</span>
              </label>
              <Input
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="BA 1 PA 7788"
                className="font-mono font-bold tracking-wide uppercase"
              />
            </div>
          </div>

          <DialogFooter>
            <span className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={!vehicleTypeId || isLoading}>
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Open ticket
              </Button>
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
