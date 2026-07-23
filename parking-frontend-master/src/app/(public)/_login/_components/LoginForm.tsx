'use client';

import AppButton from '@/components/cComponents/form/appButton/AppButton';
import PTextField from '@/components/pComponents/form/pTextField/PTextField';
import useAutoFocus from '@/hooks/common/useAutoFocus';
import EmailIcon from '@mui/icons-material/Email';
import KeyIcon from '@mui/icons-material/Key';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import { useState } from 'react';
import { useLogin } from '@/app/(public)/_login/_hooks/useLogin';
import type { ILoginProps } from '@/app/(public)/_login/_redux/types';

const LOGO_URL = '/images/website/sallyanHouse.png';

export default function LoginForm({ redirectUrl = '' }: ILoginProps) {
  const {
    handleSubmit,
    onSubmit,
    isLoadingLogin,
    showForgetPassword,
    loadingForgetPasswordRequest,
    control,
    // toggleForgetPassword,
    toggleBackToLoginPassword,
    trigger,
  } = useLogin(redirectUrl);
  useAutoFocus(trigger);
  const [showPassword, setShowPassword] = useState(false);
  const handleClickShowPassword = () => setShowPassword((show) => !show);
  const handleMouseDownPassword = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };
  return (
    <Paper sx={{ maxWidth: '650px' }} elevation={3}>
      <Grid container>
        <Grid item sx={{ padding: '10px' }} xs={7}>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Grid container spacing={2} mt="10px">
              <Grid
                item
                sx={{
                  color: '#545b5e',
                  display: 'flex',
                  justifyContent: 'flex-start',
                  marginBottom: '10px',
                }}
                xs={12}
              >
                <h2 style={{ color: '#5b554e' }}>Sign in</h2>
              </Grid>
              {!showForgetPassword ? (
                <>
                  <PTextField
                    label="Email or Username"
                    control={control}
                    required
                    xs={12}
                    name="persona"
                    autoFocus
                    startAdornment={
                      <InputAdornment position="start">
                        <IconButton
                          aria-label="email field"
                          edge="start"
                          disableRipple
                          tabIndex={-1}
                        >
                          <EmailIcon />
                        </IconButton>
                      </InputAdornment>
                    }
                  />
                  <PTextField
                    control={control}
                    label="Password"
                    xs={12}
                    required
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    startAdornment={
                      <InputAdornment position="start">
                        <IconButton
                          aria-label="password field"
                          edge="start"
                          disableRipple
                          tabIndex={-1}
                        >
                          <KeyIcon />
                        </IconButton>
                      </InputAdornment>
                    }
                    endAdornment={
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle password visibility"
                          onClick={handleClickShowPassword}
                          onMouseDown={handleMouseDownPassword}
                          edge="end"
                          tabIndex={-1}
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    }
                  />
                  <Grid item container justifyContent="space-between" mt={2}>
                    <Grid item md={6} xs={12}>
                      <AppButton
                        type="submit"
                        effect
                        loading={isLoadingLogin}
                        extendStyle
                        sx={{
                          backgroundColor: '#a59b8a',
                          '&:hover': {
                            backgroundColor: '#5b554e',
                            color: '#fff',
                            transform: 'translateY(-3px)',
                          },
                          '&:active': {
                            transform: 'translateY(-1px)',
                          },
                        }}
                      >
                        Login
                      </AppButton>
                    </Grid>
                    {/* <Grid item xs={12} md={6} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <AppButton variant="text" onClick={toggleForgetPassword}>
                        Forget your password?
                      </AppButton>
                    </Grid> */}
                  </Grid>
                </>
              ) : (
                <>
                  <Grid item mb="2.5rem" sx={{ color: '#545b5e' }}>
                    <p>
                      Lost your password? Please enter your email address. You will receive mail
                      with link to set new password.
                    </p>
                  </Grid>
                  <PTextField
                    control={control}
                    label="Email or Username"
                    required
                    xs={12}
                    name="email"
                    startAdornment={
                      <InputAdornment position="start">
                        <IconButton
                          aria-label="email field"
                          edge="start"
                          disableRipple
                          tabIndex={-1}
                        >
                          <EmailIcon sx={{ fontSize: '2.5rem' }} />
                        </IconButton>
                      </InputAdornment>
                    }
                  />
                  <Grid item container justifyContent="space-between" mt="1rem">
                    <Grid item md={6} xs={12}>
                      <AppButton effect type="submit" loading={loadingForgetPasswordRequest}>
                        Reset Password
                      </AppButton>
                    </Grid>
                    <Grid item xs={12} md={6} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <AppButton variant="text" onClick={toggleBackToLoginPassword}>
                        Back to Login
                      </AppButton>
                    </Grid>
                  </Grid>
                </>
              )}
            </Grid>
          </form>
        </Grid>
        <Grid item xs={5}>
          <img src={LOGO_URL} alt="Sallyan House" style={{ width: '100%', height: '100%' }} />
        </Grid>
      </Grid>
    </Paper>
  );
}

