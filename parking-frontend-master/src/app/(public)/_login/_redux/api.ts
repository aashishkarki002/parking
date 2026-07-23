import { baseApiSlice } from '@/lib/public/baseApiSlice';
import {
  FORGOT_PASSWORD_REQUEST,
  FORGOT_PASSWORD_UPDATE,
  LOGIN,
  LOGOUT,
} from '@/app/(public)/(auth)/_constants/apiEndpoints';

export const loginApiSlice = baseApiSlice.injectEndpoints({
  endpoints: (builder) => ({
    publicLogin: builder.mutation({
      query: ({ values }) => {
        return {
          url: LOGIN,
          method: 'POST',
          data: values,
        };
      },
    }),
    publicLogout: builder.mutation({
      query: (values) => {
        return {
          url: LOGOUT,
          method: 'POST',
          data: values,
        };
      },
    }),
    publicForgetPasswordRequest: builder.mutation({
      query: (values) => {
        return {
          url: FORGOT_PASSWORD_REQUEST,
          method: 'POST',
          data: values,
        };
      },
    }),
    publicForgetPassword: builder.mutation({
      query: (values) => {
        return {
          url: FORGOT_PASSWORD_UPDATE,
          method: 'POST',
          data: values,
        };
      },
    }),
  }),
});

export const {
  usePublicLoginMutation,
  usePublicLogoutMutation,
  usePublicForgetPasswordMutation,
  usePublicForgetPasswordRequestMutation,
} = loginApiSlice;

