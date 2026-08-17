import { baseApiSlice } from '@/lib/public/baseApiSlice';

// Match Django URLs used by Next app:
//   POST /api/v1/parking/sessions/                      (scan/create)
//   GET  /api/v1/parking/sessions/<ticket>               (read-only lookup, no side effects — used by the Stamp flow)
//   POST /api/v1/parking/sessions/<ticket>/calculate-charge
//   POST /api/v1/parking/sessions/<ticket>/mark-paid
//   POST /api/v1/parking/sessions/<ticket>/apply-coupon
//   POST /api/v1/parking/sessions/<ticket>/apply-stamp   (records a tenant's stamp; grants that tenant's free minutes)
//   POST /api/v1/parking/sessions/tenant-card/scan       (preview only, no write)
//   POST /api/v1/parking/sessions/tenant-card/confirm    (commits entry/exit)
//   GET  /api/v1/parking/staff/?search=<name|plate>      (manual lookup for offline OTP entry)
//   POST /api/v1/parking/staff/                          (register vehicle)
//   GET  /api/v1/parking/vehicle-types/                  (Car, Motorcycle, ...)
//   GET  /api/v1/parking/vendors/                        (tenant companies / units)
//   POST /api/v1/parking/parking-passes/                 (issue a monthly pass)
export const scanApi = 'parking/sessions';
export const staffApi = 'parking/staff';
export const vehicleTypesApi = 'parking/vehicle-types';
export const vendorsApi = 'parking/vendors';
export const parkingPassesApi = 'parking/parking-passes';

export const scanApiSlice = baseApiSlice.injectEndpoints({
  endpoints: (builder) => ({
    scanCode: builder.mutation({
      query: (values) => {
        return {
          url: scanApi,
          method: 'POST',
          data: values,
        };
      },
      invalidatesTags: ['Sessions'],
    }),
    printBill: builder.mutation({
      query: ({ ticketNo }) => {
        return {
          url: `${scanApi}/${ticketNo}/calculate-charge`,
          method: 'POST',
        };
      },
      invalidatesTags: ['Sessions'],
    }),
    paymentMethod: builder.mutation({
      query: ({ ticketNo, payment_method }) => {
        return {
          url: `${scanApi}/${ticketNo}/mark-paid`,
          method: 'POST',
          data: {
            payment_method,
          },
        };
      },
      invalidatesTags: ['Sessions'],
    }),
    applyCoupon: builder.mutation({
      query: ({ ticketNo, coupon_code }) => {
        return {
          url: `${scanApi}/${ticketNo}/apply-coupon`,
          method: 'POST',
          data: {
            coupon_code,
          },
        };
      },
    }),
    getSessionByTicket: builder.query({
      query: (ticketNo: string) => {
        return {
          url: `${scanApi}/${ticketNo}`,
          method: 'GET',
        };
      },
    }),
    applyStamp: builder.mutation({
      query: ({ ticketNo, vendor_id }) => {
        return {
          url: `${scanApi}/${ticketNo}/apply-stamp`,
          method: 'POST',
          data: {
            vendor_id,
          },
        };
      },
    }),
    tenantCardScan: builder.mutation({
      query: ({ card_code }) => {
        return {
          url: `${scanApi}/tenant-card/scan`,
          method: 'POST',
          data: {
            card_code,
          },
        };
      },
    }),
    tenantCardConfirm: builder.mutation({
      query: ({ card_code }) => {
        return {
          url: `${scanApi}/tenant-card/confirm`,
          method: 'POST',
          data: {
            card_code,
          },
        };
      },
      invalidatesTags: ['Sessions'],
    }),
    searchStaff: builder.query({
      query: (search: string) => {
        return {
          url: staffApi,
          method: 'GET',
          params: { search },
        };
      },
    }),
    getSessions: builder.query({
      query: () => {
        return {
          url: scanApi,
          method: 'GET',
        };
      },
      providesTags: ['Sessions'],
    }),
    getStaff: builder.query({
      query: () => {
        return {
          url: staffApi,
          method: 'GET',
        };
      },
      providesTags: ['Staff'],
    }),
    createStaff: builder.mutation({
      query: (values) => {
        return {
          url: staffApi,
          method: 'POST',
          data: values,
        };
      },
      invalidatesTags: ['Staff'],
    }),
    getVehicleTypes: builder.query({
      query: () => {
        return {
          url: vehicleTypesApi,
          method: 'GET',
        };
      },
    }),
    getVendors: builder.query({
      query: () => {
        return {
          url: vendorsApi,
          method: 'GET',
        };
      },
    }),
    createParkingPass: builder.mutation({
      query: (values) => {
        return {
          url: parkingPassesApi,
          method: 'POST',
          data: values,
        };
      },
      invalidatesTags: ['Staff', 'ParkingPasses'],
    }),
    getParkingPasses: builder.query({
      query: () => {
        return {
          url: parkingPassesApi,
          method: 'GET',
        };
      },
      providesTags: ['ParkingPasses'],
    }),
    updateParkingPass: builder.mutation({
      query: ({ id, ...values }) => {
        return {
          url: `${parkingPassesApi}/${id}`,
          method: 'PATCH',
          data: values,
        };
      },
      invalidatesTags: ['ParkingPasses'],
    }),
    updateStaff: builder.mutation({
      query: ({ id, ...values }) => {
        return {
          url: `${staffApi}/${id}`,
          method: 'PATCH',
          data: values,
        };
      },
    }),
  }),
});

export const {
  usePrintBillMutation,
  useScanCodeMutation,
  usePaymentMethodMutation,
  useApplyCouponMutation,
  useTenantCardScanMutation,
  useTenantCardConfirmMutation,
  useLazySearchStaffQuery,
  useLazyGetSessionByTicketQuery,
  useApplyStampMutation,
  useGetSessionsQuery,
  useGetStaffQuery,
  useCreateStaffMutation,
  useGetVehicleTypesQuery,
  useGetVendorsQuery,
  useCreateParkingPassMutation,
  useGetParkingPassesQuery,
  useUpdateParkingPassMutation,
  useUpdateStaffMutation,
} = scanApiSlice;

