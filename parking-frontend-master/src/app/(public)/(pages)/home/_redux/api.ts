import { baseApiSlice } from '@/lib/public/baseApiSlice';
import type { NightPricingConfig, PricingPlan } from '@/components/settings/types';
import type { ReportMetrics } from '@/components/reports/metrics';
import type { PassFeeSummary } from '@/components/reports/passes';

// Match Django URLs used by Next app:
//   POST /api/v1/parking/sessions/                      (scan/create)
//   GET  /api/v1/parking/sessions/<ticket>               (read-only lookup, no side effects — used by the Stamp flow)
//   POST /api/v1/parking/sessions/<ticket>/calculate-charge
//   POST /api/v1/parking/sessions/<ticket>/mark-paid
//   POST /api/v1/parking/sessions/<ticket>/mark-lost     (lost ticket: close now at the flat fine)
//   GET  /api/v1/parking/sessions/open-lookup?q=<plate|ticket>  (unpaid parked sessions, to find a lost ticket)
//   POST /api/v1/parking/sessions/<ticket>/apply-coupon
//   POST /api/v1/parking/sessions/<ticket>/apply-stamp   (records a tenant's stamp; grants that tenant's free minutes)
//   POST /api/v1/parking/sessions/tenant-card/scan       (preview only, no write)
//   POST /api/v1/parking/sessions/tenant-card/confirm    (commits entry/exit)
//   POST /api/v1/parking/rfid-tap                        (RFID card tap — toggles entry/exit)
//   POST /api/v1/parking/rfid-force-entry                (operator fix: that "exit" was really an arrival)
//   GET  /api/v1/parking/rfid-today                      (today's tenant sessions, parked first)
//   GET  /api/v1/parking/rfid-lookup?uid=<uid>           (whose card is this — read-only, no gate action)
//   GET  /api/v1/parking/rfid-taps?date=<YYYY-MM-DD>     (every RFID tap that day + entry/exit/rejected totals)
//   GET  /api/v1/parking/rates                           (rate card: each vehicle type's plan + night window)
//   GET  /api/v1/parking/staff/?search=<name|plate>      (manual lookup for offline OTP entry)
//   POST /api/v1/parking/staff/                          (register vehicle)
//   POST  /api/v1/parking/rfid-cards                     (issue an RFID card to a member — uid + staff)
//   PATCH /api/v1/parking/rfid-cards/<id>                (block/unblock a member's RFID card — is_active only)
//   GET  /api/v1/parking/vehicle-types/                  (Car, Motorcycle, ...)
//   GET  /api/v1/parking/vendors/                        (tenant companies / units)
//   POST /api/v1/parking/parking-passes/                 (issue a monthly pass)
//   GET  /api/v1/parking/search?q=<term>                 (global ⌘K search across sessions, members, tenants, ...)
// GET /parking/rates — see management.views.parking_rates.
export interface ParkingRates extends NightPricingConfig {
  currency_symbol: string;
  time_zone: string; // IANA, e.g. "Asia/Kathmandu" — the night window is in this zone
  vehicle_types: {
    id: number;
    name: string;
    category: string;
    free_duration_minutes: number;
    pricing_plan: PricingPlan | null;
  }[];
}

// GET /parking/rfid-taps — see management.rfid.tap_log.
export type RfidTapAction = 'ENTRY' | 'EXIT' | 'REJECTED' | 'FORCED_ENTRY';

export interface RfidTap {
  id: number;
  scanned_at: string;
  action: RfidTapAction;
  uid: string;
  reject_reason: string;
  card_known: boolean;
  card_active: boolean | null;
  tenant: {
    id: number;
    name: string;
    company: string | null;
    company_id: number | null;
    license_plate: string;
  } | null;
}

export interface RfidTapLog {
  date: string;
  summary: {
    total: number;
    /** Includes staff-forced entries. */
    entries: number;
    exits: number;
    rejected: number;
    forced: number;
    /** Rejections of a card that isn't issued or is blocked. */
    unknown: number;
    /** Distinct cards tapped. */
    cards: number;
  };
  hours: { hour: number; entries: number; exits: number; rejected: number }[];
  count: number;
  results: RfidTap[];
}

export interface RfidTapLogArgs {
  date: string;
  /** ENTRY includes forced entries. */
  action?: 'ENTRY' | 'EXIT' | 'REJECTED';
  q?: string;
  uid?: string;
  offset?: number;
  limit?: number;
}

export const scanApi = 'parking/sessions';
export const staffApi = 'parking/staff';
export const vendorsApi = 'parking/vendors';
export const vehicleTypesApi = 'parking/vehicle-types';
export const parkingPassesApi = 'parking/parking-passes';
export const rfidApi = 'parking/rfid';
export const globalSearchApi = 'parking/search';
export const ratesApi = 'parking/rates';
export const dashboardApi = 'parking/dashboard';

// GET /parking/dashboard/summary — see management.dashboard_views.
export interface DashboardTotals {
  count: number;
  revenue: number;
  digital: number;
}

export type DashboardCounts = [label: string, count: number][];

export interface DashboardSummary {
  current: DashboardTotals;
  previous: DashboardTotals;
  /** One entry per bucket between consecutive `edges`. */
  buckets: { cash: number; digital: number }[];
  mix: { vehicle: DashboardCounts; payment: DashboardCounts; status: DashboardCounts };
}

export interface DashboardSummaryArgs {
  start: string;
  end: string;
  prev_start: string;
  prev_end: string;
  /** Comma-separated ISO instants. */
  edges: string;
}

export interface DashboardSessionRow {
  id: string;
  ticket_number: string;
  license_plate: string;
  status: string;
  entry_time: string;
  calculated_charge: string | null;
}

export interface DashboardSessionsArgs {
  start: string;
  end: string;
  status: string;
  page: number;
  page_size: number;
}

// GET /parking/reports/summary — see management.report_views.report_summary.
export interface ReportTraffic {
  arrivals: number[];
  sessions: number;
  avgDurationMinutes: number;
  uniqueVehicles: number;
  registeredVehicles: number;
  repeatVisits: number;
}

export interface ReportSummary {
  current: ReportMetrics;
  previous: ReportMetrics;
  passFees: PassFeeSummary;
  traffic: { all: ReportTraffic; two: ReportTraffic; four: ReportTraffic };
}

// GET /parking/sessions-table — one filtered page, newest first.
export interface SessionsTableArgs {
  status?: string;
  vehicle_type?: string;
  payment?: string;
  entry_after?: string;
  entry_before?: string;
  search?: string;
  /** Exact plate, ignoring spaces, dashes and case. */
  plate?: string;
  page?: number;
  page_size?: number;
  /** Lifts the page-size cap for the CSV download. */
  export?: 1;
}

// GET /parking/sessions-table/overview — the sessions page's KPI strip.
export interface SessionsOverview {
  stats: {
    activeCount: number;
    longestMins: number;
    longestVehicle: string;
    overstayCount: number;
    closedTodayCount: number;
    avgStay: number;
    hasTimedExits: boolean;
    autoClosedToday: number;
    cashToday: number;
    onlineToday: number;
    collectedToday: number;
    unsettledCount: number;
    unsettledTotal: number;
  };
  tabCounts: Partial<Record<string, number>>;
  parkedMix: DashboardCounts;
  vehicleTypes: string[];
  todaySpans: { entry_time: string; exit_time: string | null }[];
}

export interface LapsedPassUsage {
  pass_id: number;
  sessions_count: number;
  unbilled: number;
}

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
    markLostTicket: builder.mutation({
      query: ({ ticketNo }: { ticketNo: string }) => {
        return {
          url: `${scanApi}/${ticketNo}/mark-lost`,
          method: 'POST',
        };
      },
      invalidatesTags: ['Sessions'],
    }),
    openSessionLookup: builder.query({
      query: (q: string) => {
        return {
          url: `${scanApi}/open-lookup`,
          method: 'GET',
          params: { q },
        };
      },
      keepUnusedDataFor: 0,
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
      // Refetched after close / mark-paid so the session page never shows a stale status.
      providesTags: ['Sessions'],
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
    getRfidTaps: builder.query<RfidTapLog, RfidTapLogArgs>({
      query: (params) => ({ url: `${rfidApi}-taps`, method: 'GET', params }),
      providesTags: ['Sessions'],
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
    getDashboardSummary: builder.query<DashboardSummary, DashboardSummaryArgs>({
      query: (params) => ({ url: `${dashboardApi}/summary`, method: 'GET', params }),
      providesTags: ['Sessions'],
    }),
    getDashboardSessions: builder.query<
      { count: number; results: DashboardSessionRow[] },
      DashboardSessionsArgs
    >({
      query: (params) => ({ url: `${dashboardApi}/sessions`, method: 'GET', params }),
      providesTags: ['Sessions'],
    }),
    getSessionCounts: builder.query<{ active: number; unpaid_exits: number }, void>({
      query: () => ({ url: `${dashboardApi}/session-counts`, method: 'GET' }),
      providesTags: ['Sessions'],
    }),
    getReportSummary: builder.query<ReportSummary, DashboardSummaryArgs>({
      query: (params) => ({ url: 'parking/reports/summary', method: 'GET', params }),
      providesTags: ['Sessions', 'ParkingPasses'],
    }),
    // Generic over the row type: each page reads its own subset of columns.
    getSessionsTable: builder.query<{ count: number; results: unknown[] }, SessionsTableArgs>({
      query: (params) => ({ url: 'parking/sessions-table', method: 'GET', params }),
      providesTags: ['Sessions'],
    }),
    getSessionsOverview: builder.query<SessionsOverview, { day_start: string }>({
      query: (params) => ({ url: 'parking/sessions-table/overview', method: 'GET', params }),
      providesTags: ['Sessions'],
    }),
    getStatementVisits: builder.query<unknown[], { start?: string; end?: string }>({
      query: (params) => ({ url: 'parking/statements/visits', method: 'GET', params }),
      providesTags: ['Sessions'],
    }),
    getStatementMonths: builder.query<string[], void>({
      query: () => ({ url: 'parking/statements/months', method: 'GET' }),
      providesTags: ['Sessions'],
    }),
    getLapsedPassUsage: builder.query<LapsedPassUsage[], void>({
      query: () => ({ url: 'parking/pass-lapsed-usage', method: 'GET' }),
      providesTags: ['Sessions', 'ParkingPasses'],
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
    // Tagged so plan, vehicle-type and night-window edits made in Settings
    // refresh the POS rate card.
    getParkingRates: builder.query<ParkingRates, void>({
      query: () => ({ url: ratesApi, method: 'GET' }),
      providesTags: ['PricingPlans', 'VehicleTypes', 'Configuration'],
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
      providesTags: ['Vendors'],
    }),
    // Only the locally-owned fields are writable; quota and gate access are
    // read-only on the serializer (EasyManage is the source of truth).
    updateVendor: builder.mutation({
      query: ({ id, ...values }) => {
        return {
          url: `${vendorsApi}/${id}`,
          method: 'PATCH',
          data: values,
        };
      },
      invalidatesTags: ['Vendors', 'Staff'],
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
  useMarkLostTicketMutation,
  useLazyOpenSessionLookupQuery,
  useApplyCouponMutation,
  useTenantCardScanMutation,
  useTenantCardConfirmMutation,
  useRfidTapMutation,
  useRfidForceEntryMutation,
  useGetRfidTodayQuery,
  useLazyRfidLookupQuery,
  useGetRfidTapsQuery,
  useLazySearchStaffQuery,
  useGlobalSearchQuery,
  useLazyGetSessionByTicketQuery,
  useGetSessionByTicketQuery,
  useApplyStampMutation,
  useGetSessionsQuery,
  useGetDashboardSummaryQuery,
  useGetDashboardSessionsQuery,
  useGetSessionCountsQuery,
  useGetReportSummaryQuery,
  useGetSessionsTableQuery,
  useLazyGetSessionsTableQuery,
  useGetSessionsOverviewQuery,
  useGetStatementVisitsQuery,
  useGetStatementMonthsQuery,
  useGetLapsedPassUsageQuery,
  useGetStaffQuery,
  useCreateStaffMutation,
  useGetVehicleTypesQuery,
  useGetParkingRatesQuery,
  useGetVendorsQuery,
  useCreateParkingPassMutation,
  useGetParkingPassesQuery,
  useUpdateParkingPassMutation,
  useUpdateStaffMutation,
  useUpdateVendorMutation,
  useCreateRfidCardMutation,
  useUpdateRfidCardMutation,
} = scanApiSlice;

