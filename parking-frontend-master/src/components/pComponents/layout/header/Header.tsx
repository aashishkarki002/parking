'use client';
import { usePublicLogoutMutation } from '@/app/(public)/_login/_redux/api';
import { logoutRequest } from '@/app/(public)/_login/_redux/slice';
import AppButton from '@/components/cComponents/form/appButton/AppButton';
import { HOME } from '@/constants/public/routes';
import { PUBLIC_REFRESH_TOKEN } from '@/constants/public/tokens';
import { baseApiSlice } from '@/lib/public/baseApiSlice';
import { useAppDispatch } from '@/lib/public/hooks';
import Cookies from 'js-cookie';
import { useNavigate } from 'react-router-dom';
import styles from './styles.module.css';

const LOGO_URL = '/images/website/sallyanHouse.png';

const Header = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [logout, { isLoading }] = usePublicLogoutMutation();
  const refreshToken = Cookies.get(PUBLIC_REFRESH_TOKEN);

  const handleLogout = () => {
    logout({ refresh: refreshToken })
      .unwrap()
      .then(() => {
        dispatch(logoutRequest());
        dispatch(baseApiSlice.util.resetApiState());
        navigate(HOME);
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Logout rejected', error);
        dispatch(logoutRequest());
        dispatch(baseApiSlice.util.resetApiState());
        navigate(HOME);
      });
  };

  return (
    <div className={styles.container}>
      <img src={LOGO_URL} alt="Sallyan House" width={80} height={70} />
      <AppButton extendStyle onClick={() => navigate('/dashboard')}>
        Dashboard
      </AppButton>
      <AppButton
        loading={isLoading}
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
        onClick={handleLogout}
      >
        Logout
      </AppButton>
    </div>
  );
};

export default Header;

