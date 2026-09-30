// Shapes returned by /parking/pricing-plans and /parking/vehicle-types.

export type PlanType = 'HOURLY' | 'FLAT_RATE_PER_DAY' | 'TIERED_HOURLY';

export interface Tier {
  up_to_hours: number;
  rate: string;
}

// `rate_details` is a free-form JSONField on the backend; the keys the charge
// calculator actually reads are the ones below (see
// ParkingSession._calculate_charge_from_plan).
export interface RateDetails {
  rate_per_hour?: string | number;
  rate_per_day?: string | number;
  tiers?: Tier[];
  [key: string]: unknown;
}

export interface PricingPlan {
  id: number;
  name: string;
  plan_type: PlanType;
  rate_details: RateDetails;
  minimum_charge: string;
  // Hourly rate for time inside the night window (ParkingConfiguration
  // night_start–night_end). "0.00" means night time is billed like day time.
  night_rate_per_hour?: string;
}

// Night-window fields of the /parking/configuration/ singleton.
export interface NightPricingConfig {
  night_pricing_enabled: boolean;
  night_start: string; // "HH:MM:SS"
  night_end: string;
  // Registered vehicles only: arriving this many minutes before night_end,
  // or leaving this many after night_start, isn't billed for those minutes.
  night_morning_grace_minutes: number;
  night_evening_grace_minutes: number;
}

// "22:00:00" -> "10 PM", "06:30:00" -> "6:30 AM"
export const formatClock = (value: string | undefined) => {
  const [h, m] = (value ?? '00:00').split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`;
};

// "10 PM–6 AM"
export const nightWindowLabel = (config: NightPricingConfig) =>
  `${formatClock(config.night_start)}–${formatClock(config.night_end)}`;

export const hasNightRate = (plan: PricingPlan) => Number(plan.night_rate_per_hour ?? 0) > 0;

// Minutes since midnight of `now` in `timeZone` (the backend's TIME_ZONE), so
// a screen agrees with billing even if the machine's own zone is off.
function minutesOfDay(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

const clockMinutes = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + (m || 0);
};

// Whether `now` falls in the night window — the same [start, end) rule as
// ParkingSession._night_seconds_between, wrapping past midnight when
// end <= start. False when night pricing is off.
export function isNightAt(config: NightPricingConfig, now: Date, timeZone: string) {
  if (!config.night_pricing_enabled || config.night_start === config.night_end) return false;
  const t = minutesOfDay(now, timeZone);
  const start = clockMinutes(config.night_start);
  const end = clockMinutes(config.night_end);
  return end <= start ? t >= start || t < end : t >= start && t < end;
}

export type VehicleCategory = 'CAR' | 'BIKE';

export interface VehicleType {
  id: number;
  name: string;
  // `pricing_plan` is a StringRelatedField, so it carries PricingPlan.__str__
  // — "<name> (Min: <minimum_charge>)", not the bare name. Join on
  // `pricing_plan_id` instead and use `planLabel`/`resolvePlan` below for the
  // name. (`pricing_plan_id` is absent on backends predating the serializer
  // change that made it readable.)
  pricing_plan: string | null;
  pricing_plan_id?: number | null;
  free_duration_minutes: number;
  category: VehicleCategory;
}

// Strips the "(Min: 30.00)" suffix PricingPlan.__str__ appends, leaving the
// plan's own name.
export const planLabel = (label: string | null | undefined): string | null => {
  if (!label) return null;
  return label.replace(/\s*\(Min:[^)]*\)\s*$/, '').trim() || label;
};

// Resolves the plan a vehicle type is priced by: the id when the backend sends
// it, otherwise the plan name recovered from the display string.
export function resolvePlan(
  plans: PricingPlan[],
  vehicleType: Pick<VehicleType, 'pricing_plan' | 'pricing_plan_id'> | null | undefined
): PricingPlan | undefined {
  if (!vehicleType) return undefined;
  if (vehicleType.pricing_plan_id != null) {
    const byId = plans.find((p) => p.id === vehicleType.pricing_plan_id);
    if (byId) return byId;
  }
  const name = planLabel(vehicleType.pricing_plan);
  if (!name) return undefined;
  return plans.find((p) => p.name === name || p.name === vehicleType.pricing_plan);
}

export const PLAN_TYPES: { value: PlanType; label: string; hint: string }[] = [
  {
    value: 'HOURLY',
    label: 'Hourly rate',
    hint: 'One rate per hour, charged proportionally to the minute.',
  },
  {
    value: 'FLAT_RATE_PER_DAY',
    label: 'Flat rate per day',
    hint: 'One rate per 24-hour block; any started day counts as a full day.',
  },
  {
    value: 'TIERED_HOURLY',
    label: 'Tiered hourly blocks',
    hint: 'Different hourly rates per bracket; time past the last bracket keeps its rate.',
  },
];

export const planTypeLabel = (type: PlanType) =>
  PLAN_TYPES.find((p) => p.value === type)?.label ?? type;

export const formatMoney = (value: string | number | undefined, currency: string) => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return `${currency} 0`;
  // Whole amounts read better without trailing zeros on a rate card.
  const body = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${currency} ${body}`;
};

export const sortedTiers = (details: RateDetails): Tier[] =>
  [...(details.tiers ?? [])].sort((a, b) => Number(a.up_to_hours) - Number(b.up_to_hours));

// One-line summary of what a plan charges, for table rows and pickers.
export function rateSummary(plan: PricingPlan, currency: string): string {
  const details = plan.rate_details ?? {};
  if (plan.plan_type === 'HOURLY') {
    return `${formatMoney(details.rate_per_hour, currency)} / hour`;
  }
  if (plan.plan_type === 'FLAT_RATE_PER_DAY') {
    return `${formatMoney(details.rate_per_day, currency)} / day`;
  }
  const tiers = sortedTiers(details);
  if (tiers.length === 0) return 'No tiers configured';
  return tiers
    .map((tier, index) => {
      const from = index === 0 ? 0 : Number(tiers[index - 1].up_to_hours);
      return `${from}–${tier.up_to_hours}h @ ${formatMoney(tier.rate, currency)}`;
    })
    .join(' · ');
}

// The night clause of a plan's rate, or null when night time bills like day
// time — no night rate, or night pricing switched off. `config` is absent for
// admins (the configuration endpoint is superadmin-only), in which case the
// window is left out.
export function nightRateSummary(
  plan: PricingPlan,
  currency: string,
  config?: NightPricingConfig | null
): string | null {
  if (!hasNightRate(plan) || (config && !config.night_pricing_enabled)) return null;
  const window = config ? ` (${nightWindowLabel(config)})` : '';
  return `Night ${formatMoney(plan.night_rate_per_hour, currency)} / hour${window}`;
}

// Flags a plan the backend would silently charge 0 for, so an operator can see
// it on the list instead of discovering it at the gate.
export function planWarning(plan: PricingPlan): string | null {
  const details = plan.rate_details ?? {};
  if (plan.plan_type === 'HOURLY' && Number(details.rate_per_hour ?? 0) <= 0) {
    return 'No hourly rate set — this plan charges nothing.';
  }
  if (plan.plan_type === 'FLAT_RATE_PER_DAY' && Number(details.rate_per_day ?? 0) <= 0) {
    return 'No daily rate set — this plan charges nothing.';
  }
  if (plan.plan_type === 'TIERED_HOURLY' && sortedTiers(details).length === 0) {
    return 'No tiers set — this plan charges nothing.';
  }
  return null;
}

export const formatDuration = (minutes: number) => {
  if (!minutes) return 'None';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};
