import { combineReducers } from '@reduxjs/toolkit';
import publicLogin from '@/app/(public)/_login/_redux/slice';
import { baseApiSlice } from './baseApiSlice';
import { publicCommonAppSlice } from './commonRedux/slice';

export const rootReducer = combineReducers({
  publicCommonApp: publicCommonAppSlice.reducer,
  publicLogin: publicLogin,
  [baseApiSlice.reducerPath]: baseApiSlice.reducer,
});

