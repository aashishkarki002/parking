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
