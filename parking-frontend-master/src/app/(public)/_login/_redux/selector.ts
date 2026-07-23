import type { RootState } from '@/lib/public/store';

export const loginSelector = (state: RootState) => {
  return state?.publicLogin;
};

