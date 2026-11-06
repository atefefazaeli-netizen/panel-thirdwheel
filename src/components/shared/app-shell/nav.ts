import {
  BookOpenCheckIcon,
  BotIcon,
  FileJsonIcon,
  LayoutDashboardIcon,
  LibraryBigIcon,
  LifeBuoyIcon,
  type LucideIcon,
  MapPinnedIcon,
  ScrollTextIcon,
  ShieldAlertIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  UserCogIcon,
  UsersIcon,
  WebhookIcon,
  KeyRoundIcon,
} from 'lucide-react';
import type { Permission } from '@/lib/permissions';

export interface NavItem {
  title: string;
  to: string;
  icon: LucideIcon;
  /** Who sees the item: holders of any of these permissions (the session's `permissions`). */
  permission: Permission | Permission[];
  /** Key into the badge counts the layout passes in. */
  badge?: 'review' | 'safety' | 'support';
  /** Match only the exact path (for parents of other items). */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Sidebar navigation. Each item names the permission its page needs (STAFF_API.md §4); the route
 * itself checks the same permission and the API enforces it again.
 */
export const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ title: 'Dashboard', to: '/', icon: LayoutDashboardIcon, exact: true, permission: 'dashboard.read' }],
  },
  {
    label: 'Content',
    items: [
      { title: 'Content', to: '/content', icon: LibraryBigIcon, permission: 'content.read' },
      { title: 'Review queue', to: '/review', icon: BookOpenCheckIcon, badge: 'review', permission: 'content.read' },
      { title: 'Import', to: '/content/import', icon: FileJsonIcon, permission: 'content.edit' },
    ],
  },
  {
    label: 'People',
    items: [
      { title: 'Users', to: '/users', icon: UsersIcon, permission: 'users.read' },
      { title: 'Safety', to: '/safety', icon: ShieldAlertIcon, badge: 'safety', permission: 'safety.read' },
      { title: 'Support inbox', to: '/support', icon: LifeBuoyIcon, badge: 'support', permission: 'support.read' },
    ],
  },
  {
    label: 'App',
    items: [{ title: 'Remote Config', to: '/app-config', icon: SlidersHorizontalIcon, permission: 'config.read' }],
  },
  {
    label: 'Settings',
    items: [
      { title: 'AI engine', to: '/ai-engine', icon: BotIcon, permission: ['ai.read', 'ai.test'] },
      { title: 'Integrations', to: '/settings/integrations', icon: WebhookIcon, permission: 'integrations.read' },
      { title: 'Audit log', to: '/audit', icon: ScrollTextIcon, permission: 'audit.read' },
    ],
  },
  {
    label: 'Staff',
    items: [
      { title: 'Staff accounts', to: '/staff', icon: UserCogIcon, permission: 'staff.read' },
      { title: 'Roles', to: '/staff/roles', icon: KeyRoundIcon, permission: 'staff.read' },
    ],
  },
  {
    label: 'Legacy (round 1)',
    items: [
      { title: 'Date ideas', to: '/catalog', icon: MapPinnedIcon, permission: 'catalog.manage' },
      { title: 'Experiences', to: '/experiences', icon: SparklesIcon, permission: 'catalog.manage' },
    ],
  },
];

export function isActive(pathname: string, item: Pick<NavItem, 'to' | 'exact'>): boolean {
  if (item.exact || item.to === '/') return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
