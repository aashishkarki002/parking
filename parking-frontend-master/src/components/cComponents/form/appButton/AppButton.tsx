import type { SxProps } from '@mui/material';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import type { IButtonProps } from './types';

const AppButton = ({
  children,
  variant,
  disableRipple,
  onClick,
  effect,
  disabled,
  endIcon,
  startIcon,
  href,
  type,
  loading,
  size,
  sx,
  extendStyle,
}: IButtonProps) => {
  let styles: SxProps = {
    display: 'flex',
    marginBottom: '5px',
    color: '#fff',
    fontSize: '14px',
    borderRadius: '8px',
    backgroundColor: '#cd1a32',
    transition: 'all .3s',

    '&:hover': {
      backgroundColor: '#cd1a32',
      color: '#fff',
      transform: effect ? 'translateY(-3px)' : '',
    },
    '&:active': {
      transform: effect ? 'translateY(-1px)' : '',
    },
  };

  if (extendStyle) {
    styles = { ...styles, ...sx };
  }

  return (
    <Button
      variant={variant ? variant : 'contained'}
      disableRipple={disableRipple}
      onClick={onClick}
      disabled={disabled || loading}
      type={type}
      size={size}
      startIcon={startIcon}
      endIcon={endIcon}
      href={href}
      sx={styles}
    >
      {children}{' '}
      {loading ? <CircularProgress size={16} sx={{ marginLeft: '5px', color: '#fff' }} /> : null}
    </Button>
  );
};

export default AppButton;

