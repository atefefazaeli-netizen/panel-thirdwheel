import { Link, useRouterState } from '@tanstack/react-router';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { canAccess, type StaffUser } from '@/stores/session';
import { isActive, NAV, type NavItem } from './nav';

export type NavBadges = Partial<Record<NonNullable<NavItem['badge']>, number | null | undefined>>;

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8! shrink-0" aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" className="text-sidebar-accent" />
      <circle cx="12" cy="16" r="5" fill="none" stroke="white" strokeWidth="2.5" />
      <circle cx="20" cy="16" r="5" fill="none" stroke="var(--sidebar-primary)" strokeWidth="2.5" />
    </svg>
  );
}

export function AppSidebar({ user, badges = {} }: { user: StaffUser | null; badges?: NavBadges }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();
  // The deepest matching item wins, so /content/import highlights Import, not Content.
  const all = NAV.flatMap((g) => g.items).filter((i) => isActive(pathname, i));
  const activeTo = all.sort((a, b) => b.to.length - a.to.length)[0]?.to;

  return (
    <Sidebar collapsible="icon" aria-label="Main navigation">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Thirdwheel panel" className="hover:bg-transparent">
              <Link to="/">
                <Mark />
                <span className="flex flex-col leading-tight">
                  <span className="font-bold text-sidebar-accent-foreground">Thirdwheel</span>
                  <span className="text-xs text-sidebar-muted">Admin and content</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.roles || canAccess(user, i.roles));
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label} className="py-1">
              <SidebarGroupLabel className="text-sidebar-muted">{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const active = item.to === activeTo;
                    const count = item.badge ? badges[item.badge] : null;
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.title}
                          className="data-[active=true]:shadow-[inset_3px_0_0_var(--sidebar-primary)]"
                        >
                          <Link
                            to={item.to}
                            aria-current={active ? 'page' : undefined}
                            onClick={() => isMobile && setOpenMobile(false)}
                          >
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                        {!!count && (
                          <SidebarMenuBadge
                            className="rounded-full bg-sidebar-primary text-sidebar-primary-foreground"
                            aria-label={`${count} waiting`}
                          >
                            {count}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="px-4 pb-3 text-xs text-sidebar-muted group-data-[collapsible=icon]:hidden">
        Release 1 content · panel v0.1
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
