import type { SxProps } from '@mui/material';
import type React from 'react';

export interface IButtonProps {
  children: string | React.ReactNode;
  variant?: 'text' | 'contained' | 'outlined';
  disableRipple?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement> | undefined;
  effect?: boolean;
  disabled?: boolean;
  startIcon?: any;
  endIcon?: any;
  href?: string;
  type?: 'submit' | 'button' | 'reset';
  loading?: boolean;
  size?: 'small' | 'medium' | 'large';
  sx?: SxProps;
  extendStyle?: boolean;
}

