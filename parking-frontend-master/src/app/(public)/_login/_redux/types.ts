export type LoginProps = {
  persona?: string;
  password?: string;
  email?: string;
  showForgetPassword?: boolean;
};
export interface permission {
  name: string;
}

export interface role {
  codename: string;
  id: number;
  isActive: boolean;
  isArchived: boolean;
  isSystemManaged: boolean;
  name: string;
  permissions: permission[] | [];
}

export interface IUserPayload {
  email: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dob?: string;
  gender?: string;
  phoneNo: number | null;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  roles: role[] | [];
  isSuperuser: boolean;
  twoFactorVerificationToken?: string;
  isTwoFaEnabled?: boolean;
  is2faEnabled?: boolean;
  twoFactorMechanisms?: any[];
  tokens?: {
    access: string;
    refresh: string;
  };
  permissions: any[];
  photo: string;
  region: {
    id: number;
    name: string;
    code: string;
    currencySymbol: string;
    currencyCode: string;
  };
  currentLanguage?: {
    code: string;
    name: string;
  };
}
export interface ILoginState extends Omit<IUserPayload, 'region'> {
  currentUser: IUserPayload | null;
  isLoggedIn?: boolean;
  isSessionExpired?: boolean;
}

export interface ILoginProps {
  redirectUrl?: string;
}

