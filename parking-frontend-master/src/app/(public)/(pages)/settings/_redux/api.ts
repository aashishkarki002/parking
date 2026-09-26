import { baseApiSlice } from '@/lib/public/baseApiSlice';

// Configuration / catalogue endpoints behind the "My profile", "Pricing plans"
// and "Vehicle types" screens:
//   GET/PATCH /api/v1/parking/configuration/     (singleton — company name, currency)
//   GET/POST  /api/v1/parking/pricing-plans      (ModelViewSet, trailing_slash=False)
//   PATCH/DEL /api/v1/parking/pricing-plans/<id>
//   GET/POST  /api/v1/parking/vehicle-types
//   PATCH/DEL /api/v1/parking/vehicle-types/<id>
export const configurationApi = 'parking/configuration/';
export const pricingPlansApi = 'parking/pricing-plans';
export const vehicleTypesApi = 'parking/vehicle-types';

export const settingsApiSlice = baseApiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getConfiguration: builder.query({
      query: () => ({ url: configurationApi, method: 'GET' }),
      providesTags: ['Configuration'],
    }),
    updateConfiguration: builder.mutation({
      query: (values) => ({ url: configurationApi, method: 'PATCH', data: values }),
      invalidatesTags: ['Configuration'],
    }),

    getPricingPlans: builder.query({
      query: () => ({ url: pricingPlansApi, method: 'GET' }),
      providesTags: ['PricingPlans'],
    }),
    createPricingPlan: builder.mutation({
      query: (values) => ({ url: pricingPlansApi, method: 'POST', data: values }),
      invalidatesTags: ['PricingPlans'],
    }),
    updatePricingPlan: builder.mutation({
      query: ({ id, ...values }) => ({
        url: `${pricingPlansApi}/${id}`,
        method: 'PATCH',
        data: values,
      }),
      // Vehicle types embed their plan's name, so a rename has to refresh both.
      invalidatesTags: ['PricingPlans', 'VehicleTypes'],
    }),
    deletePricingPlan: builder.mutation({
      query: (id: number) => ({ url: `${pricingPlansApi}/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PricingPlans'],
    }),

    createVehicleType: builder.mutation({
      query: (values) => ({ url: vehicleTypesApi, method: 'POST', data: values }),
      invalidatesTags: ['VehicleTypes'],
    }),
    updateVehicleType: builder.mutation({
      query: ({ id, ...values }) => ({
        url: `${vehicleTypesApi}/${id}`,
        method: 'PATCH',
        data: values,
      }),
      invalidatesTags: ['VehicleTypes'],
    }),
    deleteVehicleType: builder.mutation({
      query: (id: number) => ({ url: `${vehicleTypesApi}/${id}`, method: 'DELETE' }),
      invalidatesTags: ['VehicleTypes'],
    }),
  }),
});

export const {
  useGetConfigurationQuery,
  useUpdateConfigurationMutation,
  useGetPricingPlansQuery,
  useCreatePricingPlanMutation,
  useUpdatePricingPlanMutation,
  useDeletePricingPlanMutation,
  useCreateVehicleTypeMutation,
  useUpdateVehicleTypeMutation,
  useDeleteVehicleTypeMutation,
} = settingsApiSlice;
