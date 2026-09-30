import { useState } from 'react';
import { Moon } from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useUpdateConfigurationMutation } from '@/app/(public)/(pages)/settings/_redux/api';
import { formatClock, nightWindowLabel, type NightPricingConfig } from '@/components/settings/types';

const labelClassName =
  'text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase';

// <input type="time"> wants "HH:MM"; the API sends "HH:MM:SS".
const toInputTime = (value: string | undefined) => (value ?? '').slice(0, 5);

// Grace minutes are whole numbers >= 0; anything else blocks Save.
const isGraceMinutes = (value: string) => /^\d+$/.test(value);

// The global night window (ParkingConfiguration). Minutes parked inside it are
// billed at each plan's night rate instead of its day pricing — see
// ParkingSession._split_day_night. The morning/evening grace spares a
// registered vehicle that only just crosses night_end or night_start — see
// ParkingSession._boundary_grace_night_minutes. The configuration endpoint is
// superadmin-only, so the page only renders this for superadmins. The form is
// seeded once from `config`; the page keys it on the saved values so it
// re-seeds after a save.
export function NightPricingCard({ config }: { config: NightPricingConfig }) {
  const [updateConfiguration, { isLoading: saving }] = useUpdateConfigurationMutation();
  const [enabled, setEnabled] = useState(config.night_pricing_enabled);
  const [start, setStart] = useState(toInputTime(config.night_start));
  const [end, setEnd] = useState(toInputTime(config.night_end));
  const [morningGrace, setMorningGrace] = useState(String(config.night_morning_grace_minutes));
  const [eveningGrace, setEveningGrace] = useState(String(config.night_evening_grace_minutes));

  const dirty =
    enabled !== config.night_pricing_enabled ||
    start !== toInputTime(config.night_start) ||
    end !== toInputTime(config.night_end) ||
    morningGrace !== String(config.night_morning_grace_minutes) ||
    eveningGrace !== String(config.night_evening_grace_minutes);
  const invalidWindow = !start || !end || start === end;
  const invalidGrace = !isGraceMinutes(morningGrace) || !isGraceMinutes(eveningGrace);
  const invalid = invalidWindow || invalidGrace;

  const save = async () => {
    try {
      await updateConfiguration({
        night_pricing_enabled: enabled,
        night_start: start,
        night_end: end,
        night_morning_grace_minutes: Number(morningGrace),
        night_evening_grace_minutes: Number(eveningGrace),
      }).unwrap();
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
            {config.night_pricing_enabled && (
              <p className="text-[12px] text-muted-foreground">
                {`Registered vehicles arriving up to ${config.night_morning_grace_minutes} min before ${formatClock(config.night_end)}, or leaving up to ${config.night_evening_grace_minutes} min after ${formatClock(config.night_start)}, aren't charged for those minutes.`}
              </p>
            )}
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
        <div className="flex flex-col gap-1.5">
          <label className={labelClassName} htmlFor="night-morning-grace">Morning grace (min)</label>
          <Input id="night-morning-grace" type="number" min={0} step={1} inputMode="numeric"
                 value={morningGrace} disabled={!enabled}
                 onChange={(e) => setMorningGrace(e.target.value)} className="w-28" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClassName} htmlFor="night-evening-grace">Evening grace (min)</label>
          <Input id="night-evening-grace" type="number" min={0} step={1} inputMode="numeric"
                 value={eveningGrace} disabled={!enabled}
                 onChange={(e) => setEveningGrace(e.target.value)} className="w-28" />
        </div>
        <Button disabled={!dirty || invalid || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {invalidWindow && enabled && (
          <p className="text-[11px] text-destructive">Start and end must differ.</p>
        )}
        {invalidGrace && enabled && (
          <p className="text-[11px] text-destructive">Grace must be a whole number of minutes, 0 or more.</p>
        )}
      </div>
    </div>
  );
}
