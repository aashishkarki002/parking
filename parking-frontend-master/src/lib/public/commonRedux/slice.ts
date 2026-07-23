import { defaultPaginationDetail } from '@/constants/common/values';
import { removeNestedField } from '@/functions/handleErrorFn';
import { createSlice } from '@reduxjs/toolkit';
import type { IPublicSliceProp } from './types';

const initialState: IPublicSliceProp = {
  showModal: false,
  errors400: null,
  search: '',
  paginationDetail: defaultPaginationDetail,
  liveSearchValue: '',
  publicApiURL: '',
  offset: 0,
  limit: 10,
  ipAddress: '',
  clientRegion: null,
};

export const publicCommonAppSlice = createSlice({
  name: 'publicCommonApp',
  initialState,
  reducers: {
    openModal: (state) => {
      state.showModal = true;
    },
    closeModal: (state) => {
      state.showModal = false;
      state.errors400 = null;
    },
    set400Errors: (state, { payload }) => {
      state.errors400 = payload;
    },
    remove400ErrorField: (state, { payload }) => {
      if (!state.errors400 || !payload) return;
      state.errors400 = removeNestedField(state.errors400, payload);
    },
    clear400Errors: (state) => {
      state.errors400 = null;
    },
    removeFieldArrayRowErr: (state, { payload }) => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (state?.errors400 as any)?.[payload?.name]?.[Number(payload?.index)];
    },
    setSearchData: (state, { payload }) => {
      state.search = payload;
    },
    setPaginationDetails: (state, { payload }) => {
      state.paginationDetail = payload;
    },
    resetSearchPagination: (state) => {
      state.search = '';
      state.paginationDetail = defaultPaginationDetail;
    },
    setLiveSearchValues: (state, { payload }) => {
      state.liveSearchValue = payload?.searchValue;
      state.publicApiURL = payload?.ApiURL;
    },
    setIpAddress: (state, { payload }) => {
      state.ipAddress = payload;
    },
    setClientRegion: (state, { payload }) => {
      state.clientRegion = payload;
    },
    setOffset: (state, { payload }) => {
      state.offset = payload;
    },
    clearOffset: (state) => {
      state.offset = 0;
    },
  },
});

export const {
  openModal,
  closeModal,
  set400Errors,
  remove400ErrorField,
  clear400Errors,
  setSearchData,
  setPaginationDetails,
  resetSearchPagination,
  setLiveSearchValues,
  removeFieldArrayRowErr,
  setOffset,
  clearOffset,
  setIpAddress,
  setClientRegion,
} = publicCommonAppSlice.actions;

export default publicCommonAppSlice.reducer;

