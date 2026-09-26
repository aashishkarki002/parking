import { useState } from 'react';
import { Moon } from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useUpdateConfigurationMutation } from '@/app/(public)/(pages)/settings/_redux/api';
import { nightWindowLabel, type NightPricingConfig } from '@/components/settings/types';

const labelClassName =
  'text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase';

// <input type="time"> wants "HH:MM"; the API sends "HH:MM:SS".
const toInputTime = (value: string | undefined) => (value ?? '').slice(0, 5);

// The global night window (ParkingConfiguration). Minutes parked inside it are
// billed at each plan's night rate instead of its day pricing — see
// ParkingSession._split_day_night. The configuration endpoint is
// superadmin-only, so the page only renders this for superadmins. The form is
// seeded once from `config`; the page keys it on the saved values so it
// re-seeds after a save.
export function NightPricingCard({ config }: { config: NightPricingConfig }) {
  const [updateConfiguration, { isLoading: saving }] = useUpdateConfigurationMutation();
  const [enabled, setEnabled] = useState(config.night_pricing_enabled);
  const [start, setStart] = useState(toInputTime(config.night_start));
  const [end, setEnd] = useState(toInputTime(config.night_end));

  const dirty =
    enabled !== config.night_pricing_enabled ||
    start !== toInputTime(config.night_start) ||
    end !== toInputTime(config.night_end);
  const invalid = !start || !end || start === end;

  const save = async () => {
    try {
      await updateConfiguration({ night_pricing_enabled: enabled, night_start: start, night_end: end }).unwrap();
      toast.success('Night pricing updated');
    } catch {
      // The axios interceptor already toasts DRF validation errors.
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Moon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <div className="text-sm font-medium text-foreground">Night pricing</div>
            <p className="text-[12px] text-muted-foreground">
              {config.night_pricing_enabled
                ? `Time parked ${nightWindowLabel(config)} is billed at each plan's night rate — for everyone, tenants and monthly passes included.`
                : 'Off — every minute is billed at the plan’s normal rate.'}
            </p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Night pricing enabled" />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className={labelClassName} htmlFor="night-start">Starts</label>
          <Input id="night-start" type="time" value={start} disabled={!enabled}
                 onChange={(e) => setStart(e.target.value)} className="w-32" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClassName} htmlFor="night-end">Ends</label>
          <Input id="night-end" type="time" value={end} disabled={!enabled}
                 onChange={(e) => setEnd(e.target.value)} className="w-32" />
        </div>
        <Button disabled={!dirty || invalid || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {invalid && enabled && (
          <p className="text-[11px] text-destructive">Start and end must differ.</p>
        )}
      </div>
    </div>
  );
}
