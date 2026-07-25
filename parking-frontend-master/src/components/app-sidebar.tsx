import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Receipt,
  Wrench,
  Users,
  FileText,
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
} from '@/components/ui/sidebar';
import { useAppSelector } from '@/lib/public/hooks';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';

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

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, email } = useAppSelector(loginSelector);

  const fullName = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ');
  const displayName = fullName || 'User';
  const displayEmail = currentUser?.email || email || '';
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const renderItem = (item: { title: string; url: string; icon: typeof LayoutDashboard }) => {
    const isActive = location.pathname === item.url;
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          onClick={() => navigate(item.url)}
          isActive={isActive}
          className={
            isActive
              ? 'rounded-md border-l-[3px] border-blue-600 bg-blue-50 pl-[calc(0.5rem-3px)] font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-600'
              : 'rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm">{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar className="border-r border-slate-200 bg-white">
      <SidebarHeader className="gap-0 border-b border-slate-100 px-3 py-4 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-900 font-serif text-sm font-bold text-white">
            E
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold text-slate-900 uppercase">easymanage</span>
            <span className="truncate text-[10px] font-medium tracking-wider text-slate-400 uppercase">
              MANAGEMENT
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1.5 py-2 sm:px-2">
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">{renderItem(topItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {groups.map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel className="truncate text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">{group.items.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-slate-100 px-1.5 py-2 sm:px-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="h-auto rounded-md py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
                {initials || 'U'}
              </div>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-sm font-medium text-slate-900">{displayName}</span>
                <span className="truncate text-xs text-slate-400">{displayEmail}</span>
              </div>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
