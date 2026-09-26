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
//   POST /api/v1/parking/rfid-tap                        (RFID card tap — toggles entry/exit)
//   POST /api/v1/parking/rfid-force-entry                (operator fix: that "exit" was really an arrival)
//   GET  /api/v1/parking/rfid-today                      (today's tenant sessions, parked first)
//   GET  /api/v1/parking/rfid-lookup?uid=<uid>           (whose card is this — read-only, no gate action)
//   GET  /api/v1/parking/staff/?search=<name|plate>      (manual lookup for offline OTP entry)
//   POST /api/v1/parking/staff/                          (register vehicle)
//   POST  /api/v1/parking/rfid-cards                     (issue an RFID card to a member — uid + staff)
//   PATCH /api/v1/parking/rfid-cards/<id>                (block/unblock a member's RFID card — is_active only)
//   GET  /api/v1/parking/vehicle-types/                  (Car, Motorcycle, ...)
//   GET  /api/v1/parking/vendors/                        (tenant companies / units)
//   POST /api/v1/parking/parking-passes/                 (issue a monthly pass)
//   GET  /api/v1/parking/search?q=<term>                 (global ⌘K search across sessions, members, tenants, ...)
export const scanApi = 'parking/sessions';
export const staffApi = 'parking/staff';
export const vendorsApi = 'parking/vendors';
export const vehicleTypesApi = 'parking/vehicle-types';
export const parkingPassesApi = 'parking/parking-passes';
export const rfidApi = 'parking/rfid';
export const globalSearchApi = 'parking/search';

export type GlobalSearchType =
  | 'session'
  | 'member'
  | 'tenant'
  | 'pass'
  | 'pricing_plan'
  | 'vehicle_type'
  | 'operator';

export interface GlobalSearchResult {
  type: GlobalSearchType;
  id: string;
  title: string;
  subtitle: string;
  meta: {
    ticket_number?: string;
    license_plate?: string;
    vendor_id?: number | null;
  };
}

export interface GlobalSearchResponse {
  q: string;
  results: GlobalSearchResult[];
}

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
    rfidTap: builder.mutation({
      query: ({ uid }: { uid: string }) => {
        return {
          url: `${rfidApi}-tap`,
          method: 'POST',
          data: { uid },
        };
      },
      invalidatesTags: ['Sessions'],
    }),
    rfidForceEntry: builder.mutation({
      query: ({ uid, session_id }: { uid: string; session_id?: string }) => {
        return {
          url: `${rfidApi}-force-entry`,
          method: 'POST',
          data: { uid, session_id },
        };
      },
      invalidatesTags: ['Sessions'],
    }),
    getRfidToday: builder.query({
      query: () => {
        return {
          url: `${rfidApi}-today`,
          method: 'GET',
        };
      },
      providesTags: ['Sessions'],
    }),
    rfidLookup: builder.query({
      query: (uid: string) => {
        return {
          url: `${rfidApi}-lookup`,
          method: 'GET',
          params: { uid },
        };
      },
      keepUnusedDataFor: 0,
    }),
    globalSearch: builder.query<GlobalSearchResponse, string>({
      query: (q) => {
        return {
          url: globalSearchApi,
          method: 'GET',
          params: { q },
        };
      },
      keepUnusedDataFor: 30,
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
      // Tagged so edits made on the Vehicle types screen refresh every other
      // consumer (vehicle form, tenants, register-vehicle dialog).
      providesTags: ['VehicleTypes'],
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
    createRfidCard: builder.mutation({
      query: ({ staff, uid }: { staff: number; uid: string }) => {
        return {
          url: `${rfidApi}-cards`,
          method: 'POST',
          data: { staff, uid },
        };
      },
    }),
    updateRfidCard: builder.mutation({
      query: ({ id, is_active }: { id: number; is_active: boolean }) => {
        return {
          url: `${rfidApi}-cards/${id}`,
          method: 'PATCH',
          data: { is_active },
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
  useRfidTapMutation,
  useRfidForceEntryMutation,
  useGetRfidTodayQuery,
  useLazyRfidLookupQuery,
  useLazySearchStaffQuery,
  useGlobalSearchQuery,
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
  useCreateRfidCardMutation,
  useUpdateRfidCardMutation,
} = scanApiSlice;

