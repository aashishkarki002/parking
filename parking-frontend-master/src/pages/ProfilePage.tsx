import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCircleIcon, ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline';
import { BadgeCheck, Building2, ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import Cookies from 'js-cookie';
import { PageShell } from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/lib/public/hooks';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';
import { logoutRequest } from '@/app/(public)/_login/_redux/slice';
import { usePublicLogoutMutation } from '@/app/(public)/_login/_redux/api';
import { baseApiSlice } from '@/lib/public/baseApiSlice';
import { PUBLIC_REFRESH_TOKEN } from '@/constants/public/tokens';
import { HOME } from '@/constants/public/routes';
import {
  useGetConfigurationQuery,
  useUpdateConfigurationMutation,
} from '@/app/(public)/(pages)/settings/_redux/api';
import { isSuperAdmin } from '@/lib/public/roles';

const labelClassName =
  'text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={labelClassName}>{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

function VerifiedPill({ verified, label }: { verified: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        verified
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400'
          : 'border-border bg-muted text-muted-foreground'
      )}
    >
      {verified && <BadgeCheck className="h-3 w-3" />}
      {label} {verified ? 'verified' : 'unverified'}
    </span>
  );
}

// The signed-in account, sourced from the login response the backend returns
// (user_app has no /me endpoint yet, so the store is the record), plus the
// global parking configuration singleton, which is editable here.
const ProfilePage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector(loginSelector);
  const [logout] = usePublicLogoutMutation();
  const canManageConfig = isSuperAdmin(user);

  // ParkingConfigurationView is superadmin-only on the backend — skip the
  // call entirely for everyone else instead of surfacing a 403 toast.
  const { data: config, isLoading: configLoading, isError: configError } =
    useGetConfigurationQuery(undefined, { skip: !canManageConfig });
  const [updateConfiguration, { isLoading: savingConfig }] = useUpdateConfigurationMutation();

  // Edits live in an overlay that starts empty, so the fields track the fetched
  // configuration until someone types — no effect syncing server state into
  // local state, and clearing the draft re-reads whatever the server now holds.
  const [draft, setDraft] = useState<{ company_name: string; currency_symbol: string } | null>(null);

  const companyName = draft?.company_name ?? config?.company_name ?? '';
  const currencySymbol = draft?.currency_symbol ?? config?.currency_symbol ?? '';

  const editField = (field: 'company_name' | 'currency_symbol', value: string) => {
    setDraft({ company_name: companyName, currency_symbol: currencySymbol, [field]: value });
  };

  const dirty =
    !!config &&
    draft !== null &&
    (companyName !== (config.company_name ?? '') || currencySymbol !== (config.currency_symbol ?? ''));

  const initials = useMemo(() => {
    const handle = (user?.email ?? '').split('@')[0];
    const parts = handle.split(/[._-]+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : handle.slice(0, 2);
    return letters.toUpperCase() || '—';
  }, [user?.email]);

  // Permissions come back either as codename strings (superusers get the single
  // 'superuser_all_access' marker) or, per role, as objects with a name.
  const permissions: string[] = useMemo(() => {
    const raw: unknown[] = user?.permissions ?? [];
    return raw
      .map((p) => (typeof p === 'string' ? p : (p as { name?: string })?.name))
      .filter((name): name is string => Boolean(name));
  }, [user?.permissions]);

  const saveConfiguration = async () => {
    const trimmedName = companyName.trim();
    const trimmedCurrency = currencySymbol.trim();
    if (!trimmedName || !trimmedCurrency) {
      toast.error('Company name and currency symbol are both required.');
      return;
    }
    try {
      await updateConfiguration({
        company_name: trimmedName,
        currency_symbol: trimmedCurrency,
      }).unwrap();
      setDraft(null);
      toast.success('Configuration saved');
    } catch {
      // Interceptor toasts the validation error (e.g. currency over 5 chars).
    }
  };

  const resetConfiguration = () => setDraft(null);

  const handleLogout = () => {
    const refreshToken = Cookies.get(PUBLIC_REFRESH_TOKEN);
    const finishLogout = () => {
      dispatch(logoutRequest());
      dispatch(baseApiSlice.util.resetApiState());
      navigate(HOME);
    };
    logout({ refresh: refreshToken }).unwrap().then(finishLogout).catch(finishLogout);
  };

  return (
    <PageShell
      title="My profile"
      actions={
        <Button size="lg" variant="outline" onClick={handleLogout}>
          <ArrowRightStartOnRectangleIcon className="h-4 w-4" />
          Log out
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-5 py-5">
            <div className="flex items-center gap-4">
              {user?.photo ? (
                <img
                  src={user.photo}
                  alt=""
                  className="h-14 w-14 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
                  {initials}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-foreground">
                    {user?.email || 'Not signed in'}
                  </span>
                  {user?.isSuperuser && (
                    <Badge variant="secondary" className="gap-1 text-[10.5px]">
                      <ShieldCheck className="h-3 w-3" />
                      Superuser
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <VerifiedPill verified={!!user?.isEmailVerified} label="Email" />
                  <VerifiedPill verified={!!user?.isPhoneVerified} label="Phone" />
                </div>
              </div>
            </div>

            <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
              <Field label="Email" value={user?.email || '—'} />
              <Field label="Phone" value={user?.phoneNo ? String(user.phoneNo) : 'Not set'} />
              <Field
                label="Roles"
                value={
                  (user?.roles ?? []).length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {(user?.roles ?? []).map((role) => (
                        <Badge key={role.id ?? role.name} variant="outline" className="text-[10.5px]">
                          {role.name}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    'No role assigned'
                  )
                }
              />
            </div>

            <p className="text-[11.5px] text-muted-foreground">
              Account details are managed in the Django admin — changes there show up here after the
              next sign-in.
            </p>
          </CardContent>
        </Card>

        {canManageConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Parking configuration
            </CardTitle>
            <CardDescription>
              One global record shared by every operator — it names the site on printed tickets and
              sets the currency shown across the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {configError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                Failed to load the parking configuration.
              </div>
            ) : configLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className={labelClassName}>Company name</label>
                    <Input
                      value={companyName}
                      maxLength={100}
                      onChange={(e) => editField('company_name', e.target.value)}
                      placeholder="e.g. Sallyan House Parking"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelClassName}>Currency symbol</label>
                    <Input
                      value={currencySymbol}
                      maxLength={5}
                      onChange={(e) => editField('currency_symbol', e.target.value)}
                      placeholder="NRs"
                    />
                    <p className="text-[11.5px] text-muted-foreground">Up to 5 characters.</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button disabled={!dirty || savingConfig} onClick={saveConfiguration}>
                    {savingConfig ? 'Saving…' : 'Save changes'}
                  </Button>
                  <Button variant="outline" disabled={!dirty || savingConfig} onClick={resetConfiguration}>
                    Discard
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircleIcon className="h-4 w-4 text-muted-foreground" />
              Access
            </CardTitle>
            <CardDescription>
              What this account is allowed to do, as granted by its roles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user?.isSuperuser ? (
              <p className="text-sm text-muted-foreground">
                Superuser — full access to every screen and every record, including the Django admin.
              </p>
            ) : permissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No explicit permissions granted. Access is limited to the default operator screens.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {permissions.map((permission) => (
                  <Badge key={permission} variant="outline" className="font-mono text-[10.5px]">
                    {permission}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
};

export default ProfilePage;
