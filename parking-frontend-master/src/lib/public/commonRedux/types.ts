import type { IPaginationDetail } from '@/constants/common/types';

export interface IErrors {
  [key: string]: string[];
}

export interface IRegionsProp {
  name: string;
  parentName: string;
  type: string;
  flag: string;
}

export interface IPublicSliceProp {
  showModal: boolean;
  errors400: IErrors | null;
  search: string;
  paginationDetail: IPaginationDetail | undefined;
  apiURL?: string;
  liveSearchValue?: string;
  publicApiURL?: string;
  offset: number;
  ipAddress?: string;
  limit: number;
  clientRegion: any;
}

export interface IResultProp {
  results: IRegionsProp[];
}

