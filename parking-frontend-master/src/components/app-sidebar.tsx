import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Squares2X2Icon,
  BuildingOffice2Icon,
  UsersIcon,
  BanknotesIcon,
  DocumentTextIcon,
  WrenchScrewdriverIcon,
  ChevronUpDownIcon,
  SunIcon,
  MoonIcon,
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
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/lib/public/hooks';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';
import { logoutRequest } from '@/app/(public)/_login/_redux/slice';
import { usePublicLogoutMutation } from '@/app/(public)/_login/_redux/api';
import { baseApiSlice } from '@/lib/public/baseApiSlice';
import { PUBLIC_REFRESH_TOKEN } from '@/constants/public/tokens';
import { HOME } from '@/constants/public/routes';
import { useTheme } from '@/hooks/theme-provider';

const topItem = { title: 'Dashboard', url: '/dashboard', icon: Squares2X2Icon };

const groups = [
  {
    label: 'Core',
    items: [
      { title: 'Properties', url: '/properties', icon: BuildingOffice2Icon },
      { title: 'Tenants', url: '/tenants', icon: UsersIcon },
    ],
  },
  {
    label: 'Finance',
    items: [
      { title: 'Billing', url: '/billing', icon: BanknotesIcon },
      { title: 'Statements', url: '/statements', icon: DocumentTextIcon },
    ],
  },
  {
    label: 'Operations',
    items: [{ title: 'Maintenance', url: '/maintenance', icon: WrenchScrewdriverIcon }],
  },
];

// TODO: replace with your real property list — pull from a `propertySelector`
// (or whatever redux slice/query holds the tenant's properties) the same way
// `loginSelector` is used below for the user.
const PLACEHOLDER_PROPERTIES = ['Sallyan House Residency', 'Sallyan Heights', 'Ganeshtar Complex'];

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { currentUser, email } = useAppSelector(loginSelector);
  const [logout] = usePublicLogoutMutation();

  // `state` is 'expanded' | 'collapsed' for the desktop icon-rail behavior.
  // On mobile the Sidebar always renders full-width inside a Sheet, so we
  // only apply the icon-only styling when we're actually on desktop.
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isCollapsed = state === 'collapsed' && !isMobile;
  const { theme, setTheme } = useTheme();

  const [propertyOpen, setPropertyOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(PLACEHOLDER_PROPERTIES[0]);

  useEffect(() => {
    if (isCollapsed) setPropertyOpen(false);
  }, [isCollapsed]);

  const fullName = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ');
  const displayName = fullName || 'User';
  const displayEmail = currentUser?.email || email || '';
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

          {groups.map((group) => (
            <SidebarGroup key={group.label} className=" ">
              {!isCollapsed && (
                <SidebarGroupLabel className=" h-auto truncate px-2.5 py-0 text-[11px] font-semibold tracking-wider text-sidebar-primary uppercase   ">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent >
                <SidebarMenu className="gap-2">{group.items.map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
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
              <PopoverContent side="top" align="center" sideOffset={12}>
                <div className="flex items-center justify-between gap-2 px-1 py-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {theme === 'dark' ? (
                      <MoonIcon className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <SunIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                    Dark mode
                  </div>
                  <Switch
                    checked={theme === 'dark'}
                    onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                  />
                </div>

                <div className="my-2 h-px bg-border" />

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
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