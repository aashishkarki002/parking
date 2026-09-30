import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAppDispatch, useAppSelector } from '@/lib/public/hooks';
import { usePublicLoginMutation } from '@/app/(public)/_login/_redux/api';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';
import { loginSuccess } from '@/app/(public)/_login/_redux/slice';
import { HOME } from '@/constants/public/routes';
import { defaultRouteForUser, isTenantUser, TENANT_PORTAL } from '@/lib/public/roles';

const labelClassName = 'text-[13px] font-medium text-foreground';

// Sign-in for tenant-portal accounts only. The backend refuses staff
// accounts here (portal: 'tenant'), and tenant accounts on the staff page.
const TenantLoginPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const loginState = useAppSelector(loginSelector);
  const [login, { isLoading }] = usePublicLoginMutation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  if (loginState.isLoggedIn) {
    return <Navigate to={isTenantUser(loginState) ? TENANT_PORTAL : defaultRouteForUser(loginState)} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    try {
      const response = await login({
        values: { persona: email.trim(), password, portal: 'tenant' },
      }).unwrap();
      if (response?.status === 'success') {
        dispatch(loginSuccess({ ...response }));
        navigate(TENANT_PORTAL, { replace: true });
      }
    } catch (err) {
      // DRF sends { non_field_errors: [...] }; the interceptor toasts it too.
      const data = (err as { data?: { non_field_errors?: string[]; persona?: string[] } })?.data;
      setError(data?.non_field_errors?.[0] ?? data?.persona?.[0] ?? 'Could not sign in. Try again.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src="/images/website/sallyanHouse.png" alt="Sallyan House" className="h-14 w-14 rounded-xl object-contain" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Tenant portal</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to register students for parking.</p>
          </div>
        </div>

        <Card>
          <CardContent className="py-5">
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tenant-email" className={labelClassName}>
                  Email
                </label>
                <Input
                  id="tenant-email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@institute.com"
                  className="h-9"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="tenant-password" className={labelClassName}>
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="tenant-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-9 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p role="alert" className="text-[12.5px] text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" disabled={isLoading} className="w-full">
                {isLoading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-[12.5px] text-muted-foreground">
          Don't have an account? Ask the parking office.
        </p>
      </div>
    </div>
  );
};

export default TenantLoginPage;
