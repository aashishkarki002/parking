import { baseApiSlice } from '../baseApiSlice';

export const publicCommonAppSlice = baseApiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPublicSearchData: builder.query({
      query({ url, search }) {
        return {
          url: `${url}${url?.includes('?') ? '&' : '?'}search=${search}`,
          method: 'GET',
        };
      },
      providesTags: ['publicSearch'],
    }),
  }),
});

export const { useGetPublicSearchDataQuery } = publicCommonAppSlice;

