import { baseApiSlice } from '@/lib/public/baseApiSlice';

// Tenant portal — see backend management/tenant_views.py.
//   GET parking/tenant/vehicles   this tenant's registered vehicles (view only)
export interface TenantVehicle {
  id: number;
  name: string;
  license_plate: string;
  vehicle_type: string | null;
  vehicle_category: 'CAR' | 'BIKE' | string | null;
  is_card_active: boolean;
}

export const tenantVehiclesApiSlice = baseApiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMyVehicles: builder.query<TenantVehicle[], void>({
      query: () => ({ url: 'parking/tenant/vehicles', method: 'GET' }),
      providesTags: ['Staff'],
    }),
  }),
});

export const { useGetMyVehiclesQuery } = tenantVehiclesApiSlice;
