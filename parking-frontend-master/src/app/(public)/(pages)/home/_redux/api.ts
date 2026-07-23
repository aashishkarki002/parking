import { baseApiSlice } from '@/lib/public/baseApiSlice';

// Match Django URLs used by Next app:
//   POST /api/v1/parking/sessions/                      (scan/create)
//   POST /api/v1/parking/sessions/<ticket>/calculate-charge
//   POST /api/v1/parking/sessions/<ticket>/mark-paid
//   POST /api/v1/parking/sessions/<ticket>/apply-coupon
//   POST /api/v1/parking/sessions/tenant-card/scan       (preview only, no write)
//   POST /api/v1/parking/sessions/tenant-card/confirm    (commits entry/exit)
//   GET  /api/v1/parking/staff/?search=<name|plate>      (manual lookup for offline OTP entry)
export const scanApi = 'parking/sessions';
export const staffApi = 'parking/staff';

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
    }),
    printBill: builder.mutation({
      query: ({ ticketNo }) => {
        return {
          url: `${scanApi}/${ticketNo}/calculate-charge`,
          method: 'POST',
        };
      },
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
} = scanApiSlice;

