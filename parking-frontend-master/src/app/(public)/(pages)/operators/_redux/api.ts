import { baseApiSlice } from '@/lib/public/baseApiSlice';

// Operator accounts — logins for desk staff, backed by Django's User model
// plus a pos/admin/superadmin Group. Superadmin-only, per management/permissions.py.
//   GET/POST  /api/v1/parking/operators      (ModelViewSet, trailing_slash=False)
//   PATCH/DEL /api/v1/parking/operators/<id>
export const operatorsApi = 'parking/operators';

export const operatorsApiSlice = baseApiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getOperators: builder.query({
      query: () => ({ url: operatorsApi, method: 'GET' }),
      providesTags: ['Operators'],
    }),
    createOperator: builder.mutation({
      query: (values) => ({ url: operatorsApi, method: 'POST', data: values }),
      invalidatesTags: ['Operators'],
    }),
    updateOperator: builder.mutation({
      query: ({ id, ...values }) => ({
        url: `${operatorsApi}/${id}`,
        method: 'PATCH',
        data: values,
      }),
      invalidatesTags: ['Operators'],
    }),
    deleteOperator: builder.mutation({
      query: (id: number) => ({ url: `${operatorsApi}/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Operators'],
    }),
  }),
});

export const {
  useGetOperatorsQuery,
  useCreateOperatorMutation,
  useUpdateOperatorMutation,
  useDeleteOperatorMutation,
} = operatorsApiSlice;
