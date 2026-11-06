// Code-based route tree. Every list page validates its search params with Zod, so filters live
// in the URL (shareable, back/forward friendly). Auth guards run in beforeLoad.
import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { auditSearchSchema } from '@/features/audit/schemas/audit';
import { ensureSession } from '@/features/auth/api/session';
import { DashboardPage } from '@/features/dashboard/routes/dashboard-page';
import { integrationsSearchSchema } from '@/features/integrations/schemas/integrations';
import { contentSearchSchema, itemSearchSchema, reviewSearchSchema } from '@/features/content/schemas/search';
import { LoginPage } from '@/features/auth/routes/login-page';
import { loginSearchSchema } from '@/features/auth/schemas/search';
import { searchValidator } from '@/lib/search';
import { safetySearchSchema } from '@/features/safety/schemas/safety';
import { supportSearchSchema } from '@/features/support/schemas/support';
import { usersSearchSchema } from '@/features/users/schemas/users';
import { catalogSearchSchema, experienceSearchSchema } from '@/features/legacy-catalog/schemas/legacy';
import { appConfigSearchSchema } from '@/features/app-config/schemas/search';
import { staffSearchSchema } from '@/features/staff/schemas/staff';
import { NAV } from '@/components/shared/app-shell/nav';
import type { Permission } from '@/lib/permissions';
import { hasPermissions, useSession } from '@/stores/session';
import { AppLayout } from './app-layout';
import { NotFound } from './not-found';
import { PendingPage } from './pending';

export interface RouterContext {
  queryClient: QueryClient;
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Breadcrumb label; a function gets the route params. */
    crumb?: string | ((params: Record<string, string>) => string);
    /**
     * The permission the page needs (any of a list). AppLayout shows "Not available for your role"
     * instead of the page when the session lacks it; the API enforces it again.
     */
    permission?: Permission | Permission[];
  }
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  validateSearch: searchValidator(loginSearchSchema),
  beforeLoad: async ({ search }: { search: { redirect?: string } }) => {
    await ensureSession();
    // A restricted session (MFA enrollment, password change) stays here to finish its step.
    if (useSession.getState().status === 'signedIn') throw redirect({ href: search.redirect ?? '/' });
  },
  component: LoginPage,
});

export const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: async ({ location }) => {
    await ensureSession();
    // Signed out, or a restricted session that must finish MFA enrollment or a password change.
    if (useSession.getState().status !== 'signedIn') {
      throw redirect({ to: '/login', search: { redirect: location.href === '/' ? undefined : location.href } });
    }
  },
  component: AppLayout,
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  staticData: { crumb: 'Dashboard', permission: 'dashboard.read' },
  beforeLoad: () => {
    // Without the dashboard, land on the first page the account can open.
    const staff = useSession.getState().staff;
    if (hasPermissions(staff, 'dashboard.read')) return;
    const first = NAV.flatMap((g) => g.items).find((i) => i.to !== '/' && hasPermissions(staff, i.permission));
    throw redirect({ href: first?.to ?? '/account' });
  },
  component: DashboardPage,
});

const accountRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'account',
  staticData: { crumb: 'My account' },
  component: lazyRouteComponent(() => import('@/features/auth/routes/account-page'), 'AccountPage'),
});

const contentRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'content',
  staticData: { crumb: 'Content', permission: 'content.read' },
});
const contentListRoute = createRoute({
  getParentRoute: () => contentRoute,
  path: '/',
  validateSearch: searchValidator(contentSearchSchema),
  component: lazyRouteComponent(() => import('@/features/content/routes/content-list-page'), 'ContentListPage'),
});
const contentImportRoute = createRoute({
  getParentRoute: () => contentRoute,
  path: 'import',
  staticData: { crumb: 'Import', permission: 'content.edit' },
  component: lazyRouteComponent(() => import('@/features/content/routes/content-import-page'), 'ContentImportPage'),
});
const contentItemRoute = createRoute({
  getParentRoute: () => contentRoute,
  path: '$id',
  staticData: { crumb: (p) => p.id ?? 'Item' },
  validateSearch: searchValidator(itemSearchSchema),
  component: lazyRouteComponent(() => import('@/features/content/routes/content-item-page'), 'ContentItemPage'),
});
const reviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'review',
  staticData: { crumb: 'Review queue', permission: 'content.read' },
  validateSearch: searchValidator(reviewSearchSchema),
  component: lazyRouteComponent(() => import('@/features/content/routes/review-queue-page'), 'ReviewQueuePage'),
});

const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'users',
  staticData: { crumb: 'Users', permission: 'users.read' },
});
const usersListRoute = createRoute({
  getParentRoute: () => usersRoute,
  path: '/',
  validateSearch: searchValidator(usersSearchSchema),
  component: lazyRouteComponent(() => import('@/features/users/routes/users-list-page'), 'UsersListPage'),
});
const userDetailRoute = createRoute({
  getParentRoute: () => usersRoute,
  path: '$id',
  staticData: { crumb: (p) => p.id ?? 'User' },
  component: lazyRouteComponent(() => import('@/features/users/routes/user-detail-page'), 'UserDetailPage'),
});

const safetyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'safety',
  staticData: { crumb: 'Safety', permission: 'safety.read' },
});
const safetyListRoute = createRoute({
  getParentRoute: () => safetyRoute,
  path: '/',
  validateSearch: searchValidator(safetySearchSchema),
  component: lazyRouteComponent(() => import('@/features/safety/routes/safety-page'), 'SafetyPage'),
});
const flagRoute = createRoute({
  getParentRoute: () => safetyRoute,
  path: '$id',
  staticData: { crumb: 'Flag' },
  component: lazyRouteComponent(() => import('@/features/safety/routes/flag-page'), 'FlagPage'),
});

const supportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'support',
  staticData: { crumb: 'Support inbox', permission: 'support.read' },
});
const supportListRoute = createRoute({
  getParentRoute: () => supportRoute,
  path: '/',
  validateSearch: searchValidator(supportSearchSchema),
  component: lazyRouteComponent(() => import('@/features/support/routes/support-page'), 'SupportPage'),
});
/** /support/<ticketId> is what support.ticket.created webhooks link to (panelUrl). */
const ticketRoute = createRoute({
  getParentRoute: () => supportRoute,
  path: '$id',
  staticData: { crumb: 'Ticket' },
  component: lazyRouteComponent(() => import('@/features/support/routes/ticket-page'), 'TicketPage'),
});

const appConfigRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'app-config',
  staticData: { crumb: 'Remote Config', permission: 'config.read' },
  validateSearch: searchValidator(appConfigSearchSchema),
  component: lazyRouteComponent(() => import('@/features/app-config/routes/app-config-page'), 'AppConfigPage'),
});

const staffRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'staff',
  staticData: { crumb: 'Staff', permission: 'staff.read' },
});
const staffListRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: '/',
  validateSearch: searchValidator(staffSearchSchema),
  component: lazyRouteComponent(() => import('@/features/staff/routes/staff-page'), 'StaffPage'),
});
const rolesRoute = createRoute({
  getParentRoute: () => staffRoute,
  path: 'roles',
  staticData: { crumb: 'Roles' },
  component: lazyRouteComponent(() => import('@/features/staff/routes/roles-page'), 'RolesPage'),
});

const aiRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'ai-engine',
  staticData: { crumb: 'AI engine', permission: ['ai.read', 'ai.test'] },
  component: lazyRouteComponent(() => import('@/features/ai-engine/routes/ai-engine-page'), 'AiEnginePage'),
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'settings',
  staticData: { crumb: 'Settings' },
});
const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/settings/integrations' });
  },
});
const integrationsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'integrations',
  staticData: { crumb: 'Integrations', permission: 'integrations.read' },
  validateSearch: searchValidator(integrationsSearchSchema),
  component: lazyRouteComponent(() => import('@/features/integrations/routes/integrations-page'), 'IntegrationsPage'),
});

const catalogRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'catalog',
  staticData: { crumb: 'Date ideas (legacy)', permission: 'catalog.manage' },
  validateSearch: searchValidator(catalogSearchSchema),
  component: lazyRouteComponent(() => import('@/features/legacy-catalog/routes/catalog-page'), 'CatalogPage'),
});
const experiencesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'experiences',
  staticData: { crumb: 'Experiences (legacy)', permission: 'catalog.manage' },
  validateSearch: searchValidator(experienceSearchSchema),
  component: lazyRouteComponent(() => import('@/features/legacy-catalog/routes/experiences-page'), 'ExperiencesPage'),
});

const auditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'audit',
  staticData: { crumb: 'Audit log', permission: 'audit.read' },
  validateSearch: searchValidator(auditSearchSchema),
  component: lazyRouteComponent(() => import('@/features/audit/routes/audit-page'), 'AuditPage'),
});

export const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    dashboardRoute,
    accountRoute,
    contentRoute.addChildren([contentListRoute, contentImportRoute, contentItemRoute]),
    reviewRoute,
    usersRoute.addChildren([usersListRoute, userDetailRoute]),
    safetyRoute.addChildren([safetyListRoute, flagRoute]),
    supportRoute.addChildren([supportListRoute, ticketRoute]),
    appConfigRoute,
    staffRoute.addChildren([staffListRoute, rolesRoute]),
    aiRoute,
    settingsRoute.addChildren([settingsIndexRoute, integrationsRoute]),
    catalogRoute,
    experiencesRoute,
    auditRoute,
  ]),
]);

export function createAppRouter(
  queryClient: QueryClient,
  opts: { history?: Parameters<typeof createRouter>[0]['history'] } = {},
) {
  return createRouter({
    routeTree,
    context: { queryClient },
    history: opts.history,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: PendingPage,
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
