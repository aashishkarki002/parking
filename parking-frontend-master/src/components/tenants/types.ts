// Shapes returned by /parking/vendors and /parking/staff, plus the derived
// rows the tenant directory renders. A tenant (Vendor on the backend) owns
// the parking quota; its members (Staff) are the individual cardholders that
// consume it — the directory is the tenant level, the member table the level
// below it.

export interface Vendor {
  id: number;
  name: string;
  location: string;
  contact_person: string;
  contact_email: string;
  car_quota: number;
  bike_quota: number;
  gate_access_allowed: boolean;
  stamp_free_minutes: number;
  external_tenant_id: string | null;
  last_synced_at: string | null;
  sync_source: string | null;
}

// A member's RFID gate card (RFIDCard on the backend). `uid` is what the booth
// reader types on a tap; leading zeros are significant.
export interface RfidCard {
  id: number;
  uid: string;
  is_active: boolean;
  created_at: string;
}

export interface StaffMember {
  id: number;
  name: string;
  company: string | null;
  license_plate: string;
  vehicle_type: string | null;
  is_card_active: boolean;
  card_code?: string;
  // Newest first. Empty until a card is issued from the admin.
  rfid_cards?: RfidCard[];
}

export type VehicleCategory = 'CAR' | 'BIKE';

export interface TenantMember extends StaffMember {
  category: VehicleCategory;
  // Derived on the client from /parking/parking-passes — the Staff endpoint
  // itself carries no pass information.
  active_pass_until: string | null;
}

export interface TenantRow {
  // Vendor id as a string, or UNASSIGNED_KEY for members with no company.
  key: string;
  name: string;
  vendor: Vendor | null;
  members: TenantMember[];
  carsUsed: number;
  bikesUsed: number;
  carQuota: number;
  bikeQuota: number;
  activeCards: number;
  monthlyPasses: number;
  expiringSoon: number;
}

export const UNASSIGNED_KEY = 'unassigned';

export const EXPIRING_WINDOW_DAYS = 30;

export const getInitials = (name: string) =>
  name
    .replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s+/i, '')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

// VehicleType.category is authoritative; the regex is only a fallback for a
// vehicle type that was deleted after the card was issued.
export const categoryFor = (
  vehicleType: string | null,
  categoryByName: Record<string, VehicleCategory>
): VehicleCategory => {
  if (vehicleType && categoryByName[vehicleType]) return categoryByName[vehicleType];
  return /bike|motor|scooter/i.test(vehicleType || '') ? 'BIKE' : 'CAR';
};
