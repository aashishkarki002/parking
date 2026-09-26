// Two-wheeler / four-wheeler, resolved for a session.
//
// Sessions carry their vehicle type's *name* ("Motorcycle", "Van / SUV"), not
// its category, so the split has to be resolved against the VehicleType list.
// `category` ('BIKE'/'CAR') is the field meant for this distinction, but some
// deployments have every row stuck on the model's 'CAR' default — the same gap
// the gate screen works around (see Options.tsx) — so it is only trusted when
// it actually distinguishes two groups, with the type's name deciding otherwise.

import type { ReportSession } from '@/components/reports/metrics';

export type VehicleClass = 'two' | 'four';
export type VehicleClassFilter = 'all' | VehicleClass;

export const VEHICLE_CLASS_FILTERS: { key: VehicleClassFilter; label: string }[] = [
  { key: 'all', label: 'All vehicles' },
  { key: 'two', label: 'Two-wheelers' },
  { key: 'four', label: 'Four-wheelers' },
];

export const vehicleClassFilterLabel = (key: VehicleClassFilter) =>
  VEHICLE_CLASS_FILTERS.find((f) => f.key === key)?.label ?? 'All vehicles';

const TWO_WHEELER_NAME = /bike|motor|scoot|moped|two[\s-]*wheel|2[\s-]*w/i;

const classifyName = (name: string): VehicleClass =>
  TWO_WHEELER_NAME.test(name) ? 'two' : 'four';

export interface VehicleTypeRow {
  id: number;
  name: string;
  category?: 'CAR' | 'BIKE';
}

export function buildVehicleClassifier(types?: VehicleTypeRow[]) {
  const trustCategory = Boolean(types?.some((t) => t.category === 'BIKE'));
  const byName = new Map<string, VehicleClass>();
  for (const type of types ?? []) {
    byName.set(
      type.name,
      trustCategory ? (type.category === 'BIKE' ? 'two' : 'four') : classifyName(type.name)
    );
  }

  // A renamed or deleted vehicle type still shows up on old sessions, so an
  // unmatched name falls back to the heuristic rather than being counted as a car.
  return (session: ReportSession): VehicleClass => {
    const name = session.vehicle_type ?? '';
    return byName.get(name) ?? classifyName(name);
  };
}
