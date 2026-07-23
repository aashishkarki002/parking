export interface IEnumTypes {
  id: string;
  name: string;
}
export interface ICountryType {
  code: string;
  label: string;
  phone: string;
  suggested?: boolean;
  name: string;
  flag?: string;
  id: number;
}

export interface IPaginationDetail {
  page: number;
  pageSize: number;
}

