import type { ReactNode } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { GlobalSearch } from '@/components/GlobalSearch';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { useAppSelector } from '@/lib/public/hooks';
import { loginSelector } from '@/app/(public)/_login/_redux/selector';
import { isTenantUser } from '@/lib/public/roles';

interface PageShellProps {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}

// Base page layout shared by every sidebar destination — sidebar + a header
// row (trigger, title, optional actions) sized to line up with the sidebar
// header's border. Page-specific content goes in `children`.
export function PageShell({ title, actions, children }: PageShellProps) {
  // Global search covers staff data (sessions, members, …) a tenant can't read.
  const isTenant = isTenantUser(useAppSelector(loginSelector));
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="h-8 w-8 shrink-0 rounded-lg border border-border text-foreground/70 hover:bg-muted hover:text-foreground" />
            <h1 className="text-lg font-semibold text-foreground sm:text-xl">{title}</h1>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            {!isTenant && <GlobalSearch />}
            {actions}
          </div>
        </div>

        <div className="px-4 py-4 sm:px-6 sm:py-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
