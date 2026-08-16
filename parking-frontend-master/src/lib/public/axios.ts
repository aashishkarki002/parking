import { publicAPIS } from '@/constants/public/routes';
import axios, { type AxiosResponse } from 'axios';
import Cookies from 'js-cookie';
import { toast } from 'react-toastify';
import { PUBLIC_ACCESS_TOKEN, PUBLIC_REFRESH_TOKEN } from '@/constants/public/tokens';

export const baseURL = `${import.meta.env.VITE_APP_BASE_URL}${import.meta.env.VITE_APP_API_VERSION}${import.meta.env.VITE_APP_IDENTIFIER}/`;

export const axiosInstance = axios.create({
  baseURL: baseURL,
});

const refreshInstance = axios.create({
  baseURL: baseURL,
});

let isRefreshing = false;
let refreshSubscribers: ((newToken: string) => void)[] = [];

const subscribeTokenRefresh = (callback: (newToken: string) => void) => {
  refreshSubscribers.push(callback);
};
const onRefreshed = (newToken: string) => {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
};
const locale = Cookies.get('NEXT_LOCALE');

axiosInstance.interceptors.request.use(
  (config: any) => {
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      toast.error('No internet connection available.', {
        toastId: 'no-internet-toast',
      });
    }

    if (!config.headers) {
      config.headers = {};
    }
    const accessToken = Cookies.get(PUBLIC_ACCESS_TOKEN);
    const isPublicRoute = publicAPIS.some((path) => {
      return config?.url?.endsWith(path);
    });
    config.headers['Authorization'] = accessToken && !isPublicRoute ? `Bearer ${accessToken}` : '';

    if (config.data instanceof FormData) {
      config.headers['Content-Type'] = 'multipart/form-data';
    } else {
      config.headers['Content-Type'] = 'application/json';
    }
    if (locale && !config.headers['Accept-Language']) {
      config.headers['Accept-Language'] = locale;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error) => {
    const errorConfig = error?.config;

    if (axios.isCancel(error)) {
      toast.error(`Request canceled ${error?.message}.`);
    } else if (error.message === 'No Internet') {
      toast.error('No internet connection available.');
    } else if (error.toJSON().message === 'Network Error') {
      toast.error('Network Error.', {
        toastId: 'network-error-toast',
      });
    }
    // 400 errors
    else if (error.response?.status === 400) {
      const data = error?.response?.data;

      // Handle 'error' field that is a list
      if (Array.isArray(data?.error)) {
        toast.error(data.error.join(' '));
      }
      // Handle 'error' as string
      else if (typeof data?.error === 'string') {
        toast.error(data.error);
      }
      // Handle 'message' as string
      else if (typeof data?.message === 'string') {
        toast.error(data.message);
      }
      // Handle form errors like { field: ["error1", "error2"] }
      else if (typeof data === 'object') {
        const firstKey = Object.keys(data)[0];
        const messages = (data as any)[firstKey];
        if (Array.isArray(messages)) {
          toast.error(messages.join(' '));
        }
      }
    } else if (error?.response?.status === 401) {
      // token invalid or expired
      if (error?.response?.data?.code === 'token_not_valid' && !errorConfig._retry) {
        errorConfig._retry = true;

        if (!isRefreshing) {
          isRefreshing = true;
          const refreshToken = Cookies.get(PUBLIC_REFRESH_TOKEN);
          Cookies.remove(PUBLIC_ACCESS_TOKEN);

          try {
            const response = await refreshInstance.post('user-app/users/token/refresh', {
              refresh: refreshToken,
            });
            if (response?.status === 200) {
              const newToken = response?.data?.access;
              Cookies.set(PUBLIC_ACCESS_TOKEN, newToken, {
                // secure: true,
              });
              onRefreshed(newToken);
              isRefreshing = false;
              return axiosInstance(errorConfig);
            }
          } catch (refreshError) {
            toast.error('Your session has expired, Please Login again to continue using the app.');
            isRefreshing = false;
            (refreshError as any).isRefreshError = true;
            throw refreshError;
          }
        }

        return new Promise<AxiosResponse>((resolve) => {
          subscribeTokenRefresh((newToken: string) => {
            errorConfig.headers['Authorization'] = `Bearer ${newToken}`;
            resolve(axiosInstance(errorConfig));
          });
        });
      } else {
        toast.info('Session expired logging you out.');
        if (typeof window !== 'undefined') {
          // Clear auth and persisted state so next load shows login (avoids "clear browser")
          Cookies.remove(PUBLIC_ACCESS_TOKEN, { path: '/' });
          Cookies.remove(PUBLIC_REFRESH_TOKEN, { path: '/' });
          import('@/lib/public/store').then(({ store }) =>
            import('@/app/(public)/_login/_redux/slice').then(({ logoutRequest }) => {
              store.dispatch(logoutRequest());
              window.location.href = '/';
            })
          ).catch(() => {
            window.location.href = '/';
          });
        }
      }
    } else if (error.response?.status === 403) {
      toast.error('Permission denied.');
    } else if (error.response?.status === 404) {
      toast.error('Resource not found.');
    } else if (error?.response?.status === 405) {
      toast.error('Method not allowed.');
    }
    // 500 errors
    else if (error.response?.status === 500 || error.response?.status > 500) {
      toast.error('Server error, try again later.');
    }

    throw error;
  },
);

