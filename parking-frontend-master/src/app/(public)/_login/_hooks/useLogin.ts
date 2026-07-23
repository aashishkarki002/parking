import { publicCommonAppSelector } from '@/lib/public/commonRedux/selector';
import { closeModal } from '@/lib/public/commonRedux/slice';
import { useAppDispatch, useAppSelector } from '@/lib/public/hooks';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { validationSchemaLogin } from '@/app/(public)/(auth)/_constants/schema';
import {
  EMAIL_CONFIRMATION,
  FORGET_PASSWORD,
  HOME,
  VERIFY_ACCOUNT,
} from '@/constants/public/routes';
import {
  usePublicForgetPasswordRequestMutation,
  usePublicLoginMutation,
} from '@/app/(public)/_login/_redux/api';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';
import { loginSuccess } from '@/app/(public)/_login/_redux/slice';
import type { LoginProps } from '@/app/(public)/_login/_redux/types';

export const useLogin = (redirectUrl: string) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isSessionExpired } = useAppSelector(loginSelector);
  const [login, { isLoading: isLoadingLogin }] = usePublicLoginMutation();
  const [forgetPasswordRequest, { isLoading: loadingForgetPasswordRequest }] =
    usePublicForgetPasswordRequestMutation();

  const { handleSubmit, watch, setValue, reset, control, trigger } = useForm<LoginProps>({
    resolver: yupResolver(validationSchemaLogin),
    defaultValues: {
      showForgetPassword: false,
      persona: '',
      password: '',
      email: '',
    },
  });
  const { showModal: openLogin } = useAppSelector(publicCommonAppSelector);

  const showForgetPassword = watch('showForgetPassword');

  const onSubmit = async (data: LoginProps) => {
    if (showForgetPassword) {
      try {
        await forgetPasswordRequest({
          email: data?.email,
          redirectUrl: FORGET_PASSWORD,
        });
        navigate(EMAIL_CONFIRMATION);
        dispatch(closeModal());
        reset({
          email: '',
        });
      } catch {
        // handled by axios/toast
      }
    } else {
      try {
        const response: any = await login({
          values: {
            persona: data?.persona,
            password: data?.password,
            redirectUrl: VERIFY_ACCOUNT,
          },
        }).unwrap();
        if (response?.status === 'success') {
          dispatch(loginSuccess({ ...response }));
          const isTwoFaEnable = response?.isTwoFaEnabled;
          if (!isTwoFaEnable) {
            const redirectToPage = localStorage.getItem('redirectToPage') === 'true';

            if (redirectToPage && redirectUrl !== '') {
              navigate(redirectUrl);
            } else {
              navigate('/home');
            }
          }
          dispatch(closeModal());
          reset({
            persona: '',
            password: '',
          });
          localStorage.removeItem('redirectToPage');
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('the error in login', e);
      }
    }
  };

  const toggleForgetPassword = () => {
    reset({
      persona: '',
      password: '',
    });
    setValue('showForgetPassword', true);
  };

  const toggleBackToLoginPassword = () => {
    reset({
      email: '',
      showForgetPassword: false,
    });
  };

  useEffect(() => {
    if (isSessionExpired) {
      navigate(HOME);
    }
    if (openLogin) {
      setValue('showForgetPassword', false);
    }
    reset({
      persona: '',
      password: '',
      email: '',
    });
  }, [isSessionExpired, openLogin, navigate, reset, setValue]);

  return {
    handleSubmit,
    onSubmit,
    isLoadingLogin,
    showForgetPassword,
    loadingForgetPasswordRequest,
    control,
    toggleForgetPassword,
    toggleBackToLoginPassword,
    dispatch,
    trigger,
  };
};

