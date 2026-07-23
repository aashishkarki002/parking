export interface ICountryType {
  id?: number;
  flag?: string;

  code: string;
  label: string;
  phone: string;
  suggested?: boolean;
  name?: string;
}

export const validationMsg = {
  required: 'Required',
  invalid: 'Invalid Url',
  minOne: 'Select at least one option',
  positive: 'Value should be more than 0',
  password:
    'Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one symbol',
  passwordMatch: 'Passwords must match',
};

export const defaultPaginationDetail = {
  page: 0,
  pageSize: 10,
};

export const GENDERS = [
  { id: 'MALE', label: 'Male' },
  { id: 'FEMALE', label: 'Female' },
];

