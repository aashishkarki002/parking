import type { SxProps } from '@mui/material';
import TextField from '@mui/material/TextField';
import type { ITextFieldProps } from './types';

const AppTextField = ({
  width,
  variant,
  name,
  id,
  readOnly,
  startAdornment,
  endAdornment,
  shrink,
  size = 'small',
  bgColor,
  error,
  autoFocus,
  hasError,
  resError,
  handleDefaultFocus,
  sx,
  extendStyle,
  helperText,
  ...rest
}: ITextFieldProps) => {
  let styles: SxProps = {
    '& .MuiOutlinedInput-root': {
      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
        border: `1px solid ${hasError ? '#d32f2f' : '#c4c4c4'}`,
      },
      boxShadow: 'none',
      borderRadius: '8px',
    },
    '& .MuiInputLabel-asterisk': {
      color: 'red',
      textAlign: 'center',
    },
  };

  if (extendStyle) {
    styles = { ...styles, ...sx };
  }

  return (
    <TextField
      key={name}
      autoFocus={autoFocus ?? false}
      error={hasError}
      variant={variant ? variant : 'outlined'}
      fullWidth
      id={id ?? name}
      name={name}
      autoComplete="new-password"
      onFocus={handleDefaultFocus}
      InputProps={{
        readOnly: readOnly,
        startAdornment: startAdornment,
        endAdornment: endAdornment,
        sx: {
          backgroundColor: bgColor,
        },
      }}
      helperText={resError || error?.message || helperText}
      size={size}
      {...rest}
      InputLabelProps={{
        sx: {
          color: '#999',
          '&.Mui-focused': {
            color: hasError ? '#d32f2f' : '#000',
          },
        },
        shrink: shrink,
      }}
      sx={styles}
    />
  );
};

export default AppTextField;

