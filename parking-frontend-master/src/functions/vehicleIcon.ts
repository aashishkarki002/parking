import { Bike, Car, Truck } from 'lucide-react';

// Shared icon heuristic for vehicle type names — used by the sessions table,
// the add-session dialog, and the register-vehicle dialog so an icon always
// means the same thing everywhere it's rendered.
export const vehicleIconFor = (name: string) => {
  if (/bike|motor|scooter/i.test(name)) return Bike;
  if (/van|suv|bus|truck/i.test(name)) return Truck;
  return Car;
};
