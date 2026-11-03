import * as React from 'react';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useSidebarStore } from '@/stores/sidebar';
import type { StaffUser } from '@/stores/session';
import { AppSidebar, type NavBadges } from './app-sidebar';
import { Breadcrumbs } from './breadcrumbs';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

export interface AppShellProps {
  user: StaffUser | null;
  badges?: NavBadges;
  onSignOut: () => void;
  /** Shown under the top bar on every page (mock API notice). */
  banner?: React.ReactNode;
  children: React.ReactNode;
}

/** Sidebar + top bar (breadcrumbs, theme, account) + page content. */
export function AppShell({ user, badges, onSignOut, banner, children }: AppShellProps) {
  const storedOpen = useSidebarStore((s) => s.open);
  const setStoredOpen = useSidebarStore((s) => s.setOpen);
  // Tablets start with the icon rail so tables get the width; the saved choice is for desktop.
  const tablet = useMediaQuery('(min-width: 768px) and (max-width: 1199px)');
  const [tabletOpen, setTabletOpen] = React.useState(false);
  const open = tablet ? tabletOpen : storedOpen;
  const setOpen = tablet ? setTabletOpen : setStoredOpen;
  const openMobile = useSidebarStore((s) => s.openMobile);
  const setOpenMobile = useSidebarStore((s) => s.setOpenMobile);

  return (
    <SidebarProvider open={open} onOpenChange={setOpen} openMobile={openMobile} onOpenMobileChange={setOpenMobile}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <AppSidebar user={user} badges={badges} />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <Breadcrumbs />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            {user && <UserMenu user={user} onSignOut={onSignOut} />}
          </div>
        </header>
        {banner}
        <div
          id="main"
          tabIndex={-1}
          className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 p-4 outline-none sm:p-6"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
