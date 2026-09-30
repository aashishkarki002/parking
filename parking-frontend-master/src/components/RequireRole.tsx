import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/lib/public/hooks';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';
import { defaultRouteForUser, hasRole } from '@/lib/public/roles';

interface RequireRoleProps {
  // Omit to just require any signed-in account (e.g. the profile page).
  roles?: string[];
  // Where a signed-out visitor is sent; the tenant portal has its own login.
  loginPath?: string;
  children: ReactElement;
}

// Route guard: `/` already gates itself on isLoggedIn (RootPage swaps in the
// login form), but every other route rendered nothing but the page — anyone
// could type the URL and see it signed out. This restores that gate and adds
// the role check the backend now enforces, so the frontend fails the same
// way instead of showing a screen that just 403s on every request.
export function RequireRole({ roles, loginPath = '/', children }: RequireRoleProps) {
  const { isLoggedIn, ...user } = useAppSelector(loginSelector);
  const location = useLocation();

  if (!isLoggedIn) {
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }
  if (roles && !hasRole(user, ...roles)) {
    return <Navigate to={defaultRouteForUser(user)} replace />;
  }
  return children;
}
