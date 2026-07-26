import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Users,
  Receipt,
  FileText,
  Wrench,
  ChevronsUpDown,
} from 'lucide-react';
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
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/lib/public/hooks';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';
import { Separator } from '@base-ui/react';

const topItem = { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard };

const groups = [
  {
    label: 'Core',
    items: [
      { title: 'Properties', url: '/properties', icon: Building2 },
      { title: 'Tenants', url: '/tenants', icon: Users },
    ],
  },
  {
    label: 'Finance',
    items: [
      { title: 'Billing', url: '/billing', icon: Receipt },
      { title: 'Statements', url: '/statements', icon: FileText },
    ],
  },
  {
    label: 'Operations',
    items: [{ title: 'Maintenance', url: '/maintenance', icon: Wrench }],
  },
];

// TODO: replace with your real property list — pull from a `propertySelector`
// (or whatever redux slice/query holds the tenant's properties) the same way
// `loginSelector` is used below for the user.
const PLACEHOLDER_PROPERTIES = ['Sallyan House Residency', 'Sallyan Heights', 'Ganeshtar Complex'];

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, email } = useAppSelector(loginSelector);

  // `state` is 'expanded' | 'collapsed' for the desktop icon-rail behavior.
  // On mobile the Sidebar always renders full-width inside a Sheet, so we
  // only apply the icon-only styling when we're actually on desktop.
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isCollapsed = state === 'collapsed' && !isMobile;

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

  const renderItem = (item: { title: string; url: string; icon: typeof LayoutDashboard }) => {
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
              ? 'bg-teal-50 text-teal-800 hover:bg-teal-50 hover:text-teal-800'
              : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 '
          )}
        >
          {isActive && !isCollapsed && (
            <span className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-teal-600 " />
          )}
          <item.icon
            className={cn(
              'h-[18px] w-[18px] shrink-0',
              isActive ? 'text-teal-700' : 'text-zinc-400 group-hover:text-zinc-600'
            )}
          />
          <span className="truncate">{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-zinc-200 bg-white ">
      <SidebarHeader className="gap-0 border-b border-zinc-100 px-3 pt-3 pb-4">
        <div
          className={cn(
            'mb-10 flex min-w-0 items-center gap-2',
            isCollapsed ? 'flex-col justify-center gap-2' : 'justify-between'
          )}
        >
          <div
            className={` flex items-center gap-3 px-1 mb-10 ${isCollapsed ? "justify-center" : ""}`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-sm font-bold text-white">
              PM
            </div>
            {!isCollapsed && (
              <div className="min-w-0 leading-tight gap-1">
                <div className="truncate text-[15px] font-semibold tracking-tight text-zinc-900 text-md">
                  Parking
                </div>
                <div className="truncate text-[10px] font-medium tracking-wide text-zinc-400 uppercase space-x-2">
                  Management
                </div>
              </div>
            )}
          </div>
          <SidebarTrigger className="h-17 w-7 shrink-0 rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600" />
          <Separator />
        </div>

        {/* Property switcher — multi-entity ownership */}

      </SidebarHeader>

      <SidebarContent className="gap-5 px-3 pt-6 pb-3 ">
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto [scrollbar-width:thin] ">
          <SidebarGroup className="p-0 mt-7">
            <SidebarGroupContent className=''>
              <SidebarMenu className="gap-1">{renderItem(topItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {groups.map((group) => (
            <SidebarGroup key={group.label} className="p-3 gap-2 ">
              {!isCollapsed && (
                <SidebarGroupLabel className="mb-2 h-auto truncate px-2.5 py-0 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase p-3   ">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent >
                <SidebarMenu className="gap-3">{group.items.map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t border-zinc-100 px-3 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={displayName}
              className={cn(
                'h-auto gap-2.5 rounded-lg px-2.5 py-2.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
                isCollapsed && 'justify-center'
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-white">
                {initials || 'U'}
              </div>
              {!isCollapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-800">{displayName}</div>
                    <div className="truncate text-xs text-zinc-400">{displayEmail}</div>
                  </div>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                </>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* Thin edge strip — lets people drag/click to re-expand from icon mode */}
      <SidebarRail />
    </Sidebar>
  );
}