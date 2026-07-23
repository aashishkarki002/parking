import type { ITextFieldProps } from '@/components/cComponents/form/appTextField/types';
import type { Control } from 'react-hook-form';

export interface IPTextFieldProps extends Omit<ITextFieldProps, 'error'> {
  xs?: number;
  sm?: number;
  md?: number;
  lg?: number;
  control?: Control<any, any>;
}

