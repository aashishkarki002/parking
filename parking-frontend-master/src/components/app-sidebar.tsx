import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Squares2X2Icon,
  BuildingOffice2Icon,
  UsersIcon,
  DocumentTextIcon,
  WrenchScrewdriverIcon,
  ChevronUpDownIcon,
  ChevronDownIcon,
  SunIcon,
  MoonIcon,
  UserCircleIcon,
  TagIcon,
  TruckIcon,
  UserGroupIcon,
  ArrowRightStartOnRectangleIcon,
} from '@heroicons/react/24/outline';
import Cookies from 'js-cookie';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/lib/public/hooks';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';
import { logoutRequest } from '@/app/(public)/_login/_redux/slice';
import { usePublicLogoutMutation } from '@/app/(public)/_login/_redux/api';
import { baseApiSlice } from '@/lib/public/baseApiSlice';
import { useGetParkingPassesQuery, useGetSessionsQuery } from '@/app/(public)/(pages)/home/_redux/api';
import { PUBLIC_REFRESH_TOKEN } from '@/constants/public/tokens';
import { HOME } from '@/constants/public/routes';
import { useTheme } from '@/hooks/theme-provider';
import { Clock10Icon } from 'lucide-react';

// Mirrors SubscriptionsPage's DUE_SOON_DAYS threshold — kept in sync manually
// since there's no shared stats endpoint to source this count from yet.
const DUE_SOON_DAYS = 14;

interface SidebarSession {
  status: 'ACTIVE' | 'COMPLETED' | 'PAID' | 'WAIVED' | 'COVERED_BY_PASS';
  calculated_charge: string | null;
}

interface SidebarPass {
  is_active: boolean;
  valid_until: string;
}

const topItem = { title: 'Dashboard', url: '/dashboard', icon: Squares2X2Icon };

type NavChild = { title: string; url: string; isActive: boolean; pill?: number };

function pillClasses(tone: 'accent' | 'warning' | 'success') {
  if (tone === 'warning') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400';
  }
  if (tone === 'success') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400';
  }
  return 'bg-sidebar-accent text-sidebar-accent-foreground';
}

function NavPill({ value, tone }: { value: number; tone: 'accent' | 'warning' | 'success' }) {
  return (
    <Badge
      variant="secondary"
      className={cn('h-5 min-w-5 shrink-0 justify-center rounded-md px-1.5 font-mono text-[10px] tabular-nums', pillClasses(tone))}
    >
      {value}
    </Badge>
  );
}

function NavExpandable({
  title,
  icon: Icon,
  isActive,
  pillCount,
  open,
  onToggle,
  children,
  onNavigate,
}: {
  title: string;
  icon: typeof Squares2X2Icon;
  isActive: boolean;
  pillCount?: number;
  open: boolean;
  onToggle: () => void;
  children: NavChild[];
  onNavigate: (url: string) => void;
}) {
  const { isMobile, state } = useSidebar();
  const isCollapsed = state === 'collapsed' && !isMobile;
  const highlighted = isActive || open;

  if (isCollapsed) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                isActive={highlighted}
                className={cn(
                  'group relative h-9 gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium',
                  highlighted
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )}
              />
            }
          >
            <Icon
              className={cn(
                'h-[18px] w-[18px] shrink-0',
                highlighted ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70'
              )}
            />
            <span className="truncate">{title}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" sideOffset={12} className="w-56">
            <DropdownMenuLabel>{title}</DropdownMenuLabel>
            {children.map((child) => (
              <DropdownMenuItem
                key={child.title}
                onClick={() => onNavigate(child.url)}
                className={cn('flex items-center justify-between gap-2', child.isActive && 'bg-sidebar-accent text-sidebar-accent-foreground')}
              >
                <span className="truncate">{child.title}</span>
                {typeof child.pill === 'number' && child.pill > 0 && <NavPill value={child.pill} tone="warning" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={onToggle}
        isActive={highlighted}
        aria-expanded={open}
        className={cn(
          'group relative h-9 gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium',
          highlighted
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
        )}
      >
        <Icon
          className={cn(
            'h-[18px] w-[18px] shrink-0',
            highlighted ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70'
          )}
        />
        <span className="flex-1 truncate text-left">{title}</span>
        {typeof pillCount === 'number' && <NavPill value={pillCount} tone="accent" />}
        <ChevronDownIcon
          className={cn('h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40 transition-transform duration-150', open && 'rotate-180')}
        />
      </SidebarMenuButton>
      {open && (
        <SidebarMenuSub>
          {children.map((child) => (
            <SidebarMenuSubItem key={child.title}>
              <SidebarMenuSubButton
                render={<button type="button" />}
                isActive={child.isActive}
                onClick={() => onNavigate(child.url)}
                className="w-full cursor-pointer justify-between"
              >
                <span className="truncate">{child.title}</span>
                {typeof child.pill === 'number' && child.pill > 0 && <NavPill value={child.pill} tone="warning" />}
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const { currentUser, email } = useAppSelector(loginSelector);
  const [logout] = usePublicLogoutMutation();

  // `state` is 'expanded' | 'collapsed' for the desktop icon-rail behavior.
  // On mobile the Sidebar always renders full-width inside a Sheet, so we
  // only apply the icon-only styling when we're actually on desktop.
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isCollapsed = state === 'collapsed' && !isMobile;
  const { theme, setTheme } = useTheme();

  // Lazily seeded from the current route so a group opens on first render
  // when it's already showing (e.g. landing on /sessions?tab=ACTIVE from a
  // link), without fighting the user's own expand/collapse afterwards.
  const [sessionsOpen, setSessionsOpen] = useState(() => location.pathname === '/sessions');
  const [subscriptionsOpen, setSubscriptionsOpen] = useState(() => location.pathname === '/subscription');

  const { data: sessionsData } = useGetSessionsQuery(undefined);
  const { data: passesData } = useGetParkingPassesQuery(undefined);
  const sessions: SidebarSession[] = sessionsData ?? [];
  const passes: SidebarPass[] = passesData ?? [];

  const activeSessionCount = useMemo(() => sessions.filter((s) => s.status === 'ACTIVE').length, [sessions]);
  const unpaidExitCount = useMemo(
    () => sessions.filter((s) => s.status === 'COMPLETED' && Number(s.calculated_charge || 0) > 0).length,
    [sessions]
  );
  const dueSoonPassCount = useMemo(() => {
    const now = dayjs();
    return passes.filter((p) => {
      if (!p.is_active) return false;
      const until = dayjs(p.valid_until);
      return !until.isBefore(now) && until.diff(now, 'day') <= DUE_SOON_DAYS;
    }).length;
  }, [passes]);

  const fullName = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ');
  const displayName = fullName || 'User';
  const displayEmail = currentUser?.email || email || '';
  const roleLabel = currentUser?.roles?.[0]?.name || 'Parking admin';
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const goTo = (url: string) => {
    navigate(url);
    // Close the mobile drawer after navigating so the sheet doesn't linger.
    setOpenMobile(false);
  };

  const accountMenuItems = [
    { title: 'My profile', url: '/profile', icon: UserCircleIcon },
    { title: 'Pricing plans', url: '/pricing-plans', icon: TagIcon },
    { title: 'Vehicle types', url: '/vehicle-types', icon: TruckIcon },
    { title: 'Manage operators', url: '/operators', icon: UserGroupIcon },
  ];

  const handleLogout = () => {
    const refreshToken = Cookies.get(PUBLIC_REFRESH_TOKEN);
    const finishLogout = () => {
      dispatch(logoutRequest());
      dispatch(baseApiSlice.util.resetApiState());
      navigate(HOME);
    };
    logout({ refresh: refreshToken }).unwrap().then(finishLogout).catch(finishLogout);
  };

  const renderItem = (item: { title: string; url: string; icon: typeof Squares2X2Icon }) => {
    const isActive = location.pathname === item.url;
    return (
      <SidebarMenuItem key={item.title} >
        <SidebarMenuButton
          onClick={() => goTo(item.url)}
          isActive={isActive}
          tooltip={item.title}
          className={cn(
            'group relative h-9 gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium ',
            isActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground '
          )}
        >
          {isActive && !isCollapsed && (
            <span className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-primary " />
          )}
          <item.icon
            className={cn(
              'h-[18px] w-[18px] shrink-0',
              isActive ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70'
            )}
          />
          <span className="truncate">{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const isSessions = location.pathname === '/sessions';
  const sessionChildren: NavChild[] = [
    { title: 'Active now', url: '/sessions?tab=ACTIVE', isActive: isSessions && searchParams.get('tab') === 'ACTIVE' },
    { title: 'Completed', url: '/sessions?tab=COMPLETED', isActive: isSessions && searchParams.get('tab') === 'COMPLETED' },
    {
      title: 'Unpaid exits',
      url: '/sessions?payment=UNPAID',
      isActive: isSessions && searchParams.get('payment') === 'UNPAID',
      pill: unpaidExitCount,
    },
  ];

  const isSubscriptions = location.pathname === '/subscription';
  const subscriptionChildren: NavChild[] = [
    { title: 'Active passes', url: '/subscription?tab=ACTIVE', isActive: isSubscriptions && searchParams.get('tab') === 'ACTIVE' },
    { title: 'Renewals due', url: '/subscription?tab=DUE_SOON', isActive: isSubscriptions && searchParams.get('tab') === 'DUE_SOON' },
    { title: 'Expired', url: '/subscription?tab=LAPSED', isActive: isSubscriptions && searchParams.get('tab') === 'LAPSED' },
  ];

  const statementsItem = { title: 'Statements', url: '/statements', icon: DocumentTextIcon };
  const maintenanceItem = { title: 'Maintenance', url: '/maintenance', icon: WrenchScrewdriverIcon };
  const tenantsItem = { title: 'Tenants', url: '/tenants', icon: UsersIcon };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar ">
      <SidebarHeader className="h-16 shrink-0 justify-center gap-0 border-b border-sidebar-border px-3 ">
        <div
          className={cn(
            ' flex min-w-0 items-center gap-2',
            isCollapsed ? 'flex-col justify-center gap-2' : 'justify-between'
          )}
        >
          <div
            className={`  flex items-center gap-3 px-1  ${isCollapsed ? "justify-center" : ""}`}
          >
            <img
              src="/images/website/sallyanHouse.png"
              alt="Sallyan House"
              className="h-8 w-8 shrink-0 rounded-lg object-contain"
            />
            {!isCollapsed && (
              <div className="min-w-0 leading-tight gap-1">
                <div className="truncate text-[15px] font-semibold tracking-tight text-sidebar-foreground text-md">
                  Parking
                </div>
                <div className="truncate text-[10px] font-medium tracking-wide text-sidebar-foreground/50 uppercase space-x-2">
                  Management
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Property switcher — multi-entity ownership */}

      </SidebarHeader>

      <SidebarContent className=" px-2   ">
        <div className="flex min-h-0 flex-1 flex-col  ">
          <SidebarGroup className="p-0 m-1">
            <SidebarGroupContent className=''>
              <SidebarMenu className="gap-1">{renderItem(topItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            {!isCollapsed && (
              <SidebarGroupLabel className=" h-auto truncate px-2.5 py-0 text-[11px] font-semibold tracking-wider text-sidebar-primary uppercase   ">
                Core
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-2">
                <NavExpandable
                  title="Sessions"
                  icon={BuildingOffice2Icon}
                  isActive={isSessions}
                  pillCount={activeSessionCount}
                  open={sessionsOpen}
                  onToggle={() => setSessionsOpen((o) => !o)}
                  onNavigate={goTo}
                  children={sessionChildren}
                />
                {renderItem(tenantsItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            {!isCollapsed && (
              <SidebarGroupLabel className=" h-auto truncate px-2.5 py-0 text-[11px] font-semibold tracking-wider text-sidebar-primary uppercase   ">
                Billing
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-2">
                <NavExpandable
                  title="Subscriptions"
                  icon={Clock10Icon}
                  isActive={isSubscriptions}
                  pillCount={dueSoonPassCount}
                  open={subscriptionsOpen}
                  onToggle={() => setSubscriptionsOpen((o) => !o)}
                  onNavigate={goTo}
                  children={subscriptionChildren}
                />
                {renderItem(statementsItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            {!isCollapsed && (
              <SidebarGroupLabel className=" h-auto truncate px-2.5 py-0 text-[11px] font-semibold tracking-wider text-sidebar-primary uppercase   ">
                Settings
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-2">{renderItem(maintenanceItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <Popover>
              <PopoverTrigger
                render={
                  <SidebarMenuButton
                    className={cn(
                      'h-auto gap-2.5 rounded-lg px-2.5 py-2.5 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                      isCollapsed && 'justify-center'
                    )}
                  />
                }
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                  {initials || 'U'}
                </div>
                {!isCollapsed && (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-sidebar-foreground">{displayName}</div>
                      <div className="truncate text-xs text-sidebar-foreground/50">{displayEmail}</div>
                    </div>
                    <ChevronUpDownIcon className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" />
                  </>
                )}
              </PopoverTrigger>
              <PopoverContent side="top" align="center" sideOffset={12} className="w-56">
                <div className="flex flex-col gap-2 px-1.5 pt-1 pb-2.5">
                  <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Signed in</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
                    <div className="mt-0.5 truncate text-xs text-primary">{roleLabel} · Sallyan House</div>
                  </div>
                </div>

                <div className="h-px bg-border" />

                <div className="flex items-center justify-between gap-2 px-1.5 py-2">
                  <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Theme</span>
                  <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      aria-pressed={theme === 'light'}
                      className={cn(
                        'flex h-7 w-8 items-center justify-center rounded text-muted-foreground',
                        theme === 'light' && 'bg-background text-primary shadow-sm'
                      )}
                    >
                      <SunIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      aria-pressed={theme === 'dark'}
                      className={cn(
                        'flex h-7 w-8 items-center justify-center rounded text-muted-foreground',
                        theme === 'dark' && 'bg-background text-primary shadow-sm'
                      )}
                    >
                      <MoonIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="h-px bg-border" />

                <div className="flex flex-col py-1">
                  {accountMenuItems.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => goTo(item.url)}
                      className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                      {item.title}
                    </button>
                  ))}
                </div>

                <div className="h-px bg-border" />

                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-1 flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <ArrowRightStartOnRectangleIcon className="h-4 w-4" />
                  Log out
                </button>
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* Thin edge strip — lets people drag/click to re-expand from icon mode */}
      <SidebarRail />
    </Sidebar>
  );
}
