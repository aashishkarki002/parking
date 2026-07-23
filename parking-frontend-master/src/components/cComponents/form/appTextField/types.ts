import type { SxProps, TextFieldVariants } from '@mui/material';
import type { FocusEventHandler, Ref } from 'react';
import type { FieldError } from 'react-hook-form';

export interface ITextFieldProps {
  label?: string;
  value?: any;
  onChange?: any;
  required?: boolean;
  disabled?: boolean;
  rows?: string | number;
  multiline?: boolean;
  width?: string;
  type?: string;
  variant?: TextFieldVariants;
  name: string;
  id?: string;
  readOnly?: boolean;
  startAdornment?: any;
  endAdornment?: any;
  FormHelperTextProps?: any;
  onFocus?: any;
  shrink?: boolean;
  size?: any;
  placeholder?: string;
  bgColor?: string;
  error?: FieldError;
  onBlur?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement> | undefined;
  className?: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  focusElement?: any;
  hasError?: boolean;
  handleDefaultFocus?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  resError?: string;
  sx?: SxProps;
  extendStyle?: boolean;
  helperText?: string;
}

