import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import Cookies from 'js-cookie';
import { PUBLIC_ACCESS_TOKEN, PUBLIC_LOGOUT_FLAG, PUBLIC_REFRESH_TOKEN } from '@/constants/public/tokens';
import type { ILoginState, IUserPayload } from './types';

const initialState: ILoginState = {
  email: '',
  phoneNo: null,
  isEmailVerified: false,
  isPhoneVerified: false,
  roles: [],
  permissions: [],
  isSuperuser: false,
  photo: '',
  currentUser: null,
  isLoggedIn: false,
  isSessionExpired: false,
  twoFactorVerificationToken: '',
  isTwoFaEnabled: false,
  twoFactorMechanisms: [],
};

export const loginSlice = createSlice({
  name: 'publicLogin',
  initialState,
  reducers: {
    loginSuccess: (state, action: PayloadAction<IUserPayload>) => {
      const {
        payload: {
          email,
          phoneNo,
          tokens,
          isEmailVerified,
          isPhoneVerified,
          isSuperuser,
          roles,
          permissions,
          photo,
          twoFactorVerificationToken,
          isTwoFaEnabled,
          is2faEnabled,
          twoFactorMechanisms,
        },
      } = action;

      state.isSessionExpired = false;
      state.currentUser = action?.payload;
      state.isLoggedIn = true;
      state.email = email;
      state.phoneNo = phoneNo;
      state.isEmailVerified = isEmailVerified;
      state.isPhoneVerified = isPhoneVerified;
      state.isSuperuser = isSuperuser;
      state.roles = roles;
      state.permissions = permissions;
      state.photo = photo;
      state.isTwoFaEnabled = isTwoFaEnabled || is2faEnabled;
      state.twoFactorMechanisms = twoFactorMechanisms ?? [];
      state.twoFactorVerificationToken = twoFactorVerificationToken ?? '';
      Cookies.set(PUBLIC_ACCESS_TOKEN, tokens?.access ?? '', {
        path: '/',
        sameSite: 'Lax',
      });
      Cookies.set(PUBLIC_REFRESH_TOKEN, tokens?.refresh ?? '', {
        path: '/',
        sameSite: 'Lax',
      });
      Cookies.set(PUBLIC_LOGOUT_FLAG, 'false');
    },
    logoutRequest: (state) => {
      state.email = '';
      state.phoneNo = null;
      state.isEmailVerified = false;
      state.isLoggedIn = false;
      state.isPhoneVerified = false;
      state.isSuperuser = false;
      state.roles = [];
      state.permissions = [];
      state.currentUser = null;
      Cookies.remove(PUBLIC_ACCESS_TOKEN, { path: '/' });
      Cookies.remove(PUBLIC_REFRESH_TOKEN, { path: '/' });
      Cookies.set(PUBLIC_LOGOUT_FLAG, 'true');
    },
    sessionExpired: (state, action) => {
      const { sessionExpired = true } = action.payload || {};
      state.isSessionExpired = sessionExpired;
    },
  },
});

export const { loginSuccess, logoutRequest, sessionExpired } = loginSlice.actions;

export default loginSlice.reducer;

