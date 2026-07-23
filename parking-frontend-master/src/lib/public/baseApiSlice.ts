import { logoutRequest, sessionExpired } from '@/app/(public)/_login/_redux/slice';
import { createApi } from '@reduxjs/toolkit/query/react';
import { axiosInstance } from './axios';
import { set400Errors } from './commonRedux/slice';

// axiosInstance already has baseURL from Vite env.
// Here we only pass the relative `url` so we don't duplicate `/api/v1`.
const axiosBaseQuery =
  () =>
  async (args: any, api: any) => {
    const { url, method, data, params, headers, signal } = args;
    try {
      const result = await axiosInstance({
        url,
        method,
        data,
        params,
        headers,
        cancelToken: signal,
      });
      return { data: result.data };
    } catch (axiosError: any) {
      if (axiosError?.response?.status === 400) {
        api.dispatch(set400Errors(axiosError?.response?.data));
      } else if (axiosError?.isRefreshError) {
        api.dispatch(logoutRequest());
        api.dispatch(sessionExpired({ sessionExpired: true }));
        api.dispatch(baseApiSlice.util.resetApiState());
      }

      return {
        error: {
          status: axiosError?.response?.status,
          data: axiosError?.response?.data || axiosError?.message,
        },
      };
    }
  };

export const baseApiSlice = createApi({
  reducerPath: 'baseApi',
  baseQuery: axiosBaseQuery(),
  endpoints: () => ({}),
  tagTypes: ['publicSearch', 'Search'],
});

