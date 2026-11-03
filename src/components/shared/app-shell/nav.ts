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
  SparklesIcon,
  UsersIcon,
  WebhookIcon,
} from 'lucide-react';
import type { StaffRole } from '@/stores/session';

export interface NavItem {
  title: string;
  to: string;
  icon: LucideIcon;
  /** Who sees the item. Omitted = every staff role. */
  roles?: StaffRole[];
  /** Key into the badge counts the layout passes in. */
  badge?: 'review' | 'safety' | 'support';
  /** Match only the exact path (for parents of other items). */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Sidebar navigation. Roles mirror ADMIN_API.md › Roles; the API enforces them again. */
export const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ title: 'Dashboard', to: '/', icon: LayoutDashboardIcon, exact: true }],
  },
  {
    label: 'Content',
    items: [
      { title: 'Content', to: '/content', icon: LibraryBigIcon },
      { title: 'Review queue', to: '/review', icon: BookOpenCheckIcon, badge: 'review' },
      { title: 'Import', to: '/content/import', icon: FileJsonIcon, roles: ['admin'] },
    ],
  },
  {
    label: 'People',
    items: [
      { title: 'Users', to: '/users', icon: UsersIcon, roles: ['admin'] },
      { title: 'Safety', to: '/safety', icon: ShieldAlertIcon, badge: 'safety' },
      { title: 'Support inbox', to: '/support', icon: LifeBuoyIcon, roles: ['admin'], badge: 'support' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { title: 'AI engine', to: '/ai-engine', icon: BotIcon },
      { title: 'Integrations', to: '/settings/integrations', icon: WebhookIcon, roles: ['admin'] },
      { title: 'Audit log', to: '/audit', icon: ScrollTextIcon, roles: ['admin'] },
    ],
  },
  {
    label: 'Legacy (round 1)',
    items: [
      { title: 'Date ideas', to: '/catalog', icon: MapPinnedIcon, roles: ['admin'] },
      { title: 'Experiences', to: '/experiences', icon: SparklesIcon, roles: ['admin'] },
    ],
  },
];

export function isActive(pathname: string, item: Pick<NavItem, 'to' | 'exact'>): boolean {
  if (item.exact || item.to === '/') return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
