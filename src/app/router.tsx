// Code-based route tree. Every list page validates its search params with Zod, so filters live
// in the URL (shareable, back/forward friendly). Auth guards run in beforeLoad.
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouter, Outlet, redirect } from '@tanstack/react-router';
import { AiEnginePage } from '@/features/ai-engine/routes/ai-engine-page';
import { ensureSession } from '@/features/auth/api/session';
import { IntegrationsPage } from '@/features/integrations/routes/integrations-page';
import { integrationsSearchSchema } from '@/features/integrations/schemas/integrations';
import { ContentImportPage } from '@/features/content/routes/content-import-page';
import { ContentItemPage } from '@/features/content/routes/content-item-page';
import { ContentListPage } from '@/features/content/routes/content-list-page';
import { ReviewQueuePage } from '@/features/content/routes/review-queue-page';
import { contentSearchSchema, itemSearchSchema, reviewSearchSchema } from '@/features/content/schemas/search';
import { LoginPage } from '@/features/auth/routes/login-page';
import { loginSearchSchema } from '@/features/auth/schemas/search';
import { searchValidator } from '@/lib/search';
import { FlagPage } from '@/features/safety/routes/flag-page';
import { SafetyPage } from '@/features/safety/routes/safety-page';
import { safetySearchSchema } from '@/features/safety/schemas/safety';
import { SupportPage } from '@/features/support/routes/support-page';
import { supportSearchSchema } from '@/features/support/schemas/support';
import { UserDetailPage } from '@/features/users/routes/user-detail-page';
import { UsersListPage } from '@/features/users/routes/users-list-page';
import { usersSearchSchema } from '@/features/users/schemas/users';
import { useSession } from '@/stores/session';
import { AppLayout } from './app-layout';
import { NotFound } from './not-found';
import { PendingPage } from './pending';
import { DashboardPage } from './placeholder-dashboard';

export interface RouterContext {
  queryClient: QueryClient;
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Breadcrumb label; a function gets the route params. */
    crumb?: string | ((params: Record<string, string>) => string);
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
  beforeLoad: async () => {
    await ensureSession();
    if (useSession.getState().status === 'signedIn') throw redirect({ to: '/' });
  },
  component: LoginPage,
});

export const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: async ({ location }) => {
    await ensureSession();
    if (useSession.getState().status !== 'signedIn') {
      throw redirect({ to: '/login', search: { redirect: location.href === '/' ? undefined : location.href } });
    }
  },
  component: AppLayout,
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  staticData: { crumb: 'Dashboard' },
  component: DashboardPage,
});

const contentRoute = createRoute({ getParentRoute: () => appRoute, path: 'content', staticData: { crumb: 'Content' } });
const contentListRoute = createRoute({
  getParentRoute: () => contentRoute,
  path: '/',
  validateSearch: searchValidator(contentSearchSchema),
  component: ContentListPage,
});
const contentImportRoute = createRoute({
  getParentRoute: () => contentRoute,
  path: 'import',
  staticData: { crumb: 'Import' },
  component: ContentImportPage,
});
const contentItemRoute = createRoute({
  getParentRoute: () => contentRoute,
  path: '$id',
  staticData: { crumb: (p) => p.id ?? 'Item' },
  validateSearch: searchValidator(itemSearchSchema),
  component: ContentItemPage,
});
const reviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'review',
  staticData: { crumb: 'Review queue' },
  validateSearch: searchValidator(reviewSearchSchema),
  component: ReviewQueuePage,
});

const usersRoute = createRoute({ getParentRoute: () => appRoute, path: 'users', staticData: { crumb: 'Users' } });
const usersListRoute = createRoute({
  getParentRoute: () => usersRoute,
  path: '/',
  validateSearch: searchValidator(usersSearchSchema),
  component: UsersListPage,
});
const userDetailRoute = createRoute({
  getParentRoute: () => usersRoute,
  path: '$id',
  staticData: { crumb: (p) => p.id ?? 'User' },
  component: UserDetailPage,
});

const safetyRoute = createRoute({ getParentRoute: () => appRoute, path: 'safety', staticData: { crumb: 'Safety' } });
const safetyListRoute = createRoute({
  getParentRoute: () => safetyRoute,
  path: '/',
  validateSearch: searchValidator(safetySearchSchema),
  component: SafetyPage,
});
const flagRoute = createRoute({
  getParentRoute: () => safetyRoute,
  path: '$id',
  staticData: { crumb: 'Flag' },
  component: FlagPage,
});

const supportRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'support',
  staticData: { crumb: 'Support inbox' },
});
const supportListRoute = createRoute({
  getParentRoute: () => supportRoute,
  path: '/',
  validateSearch: searchValidator(supportSearchSchema),
  component: SupportPage,
});
/** /support/<ticketId> is what support.ticket.created webhooks link to (panelUrl). */
const ticketRoute = createRoute({
  getParentRoute: () => supportRoute,
  path: '$id',
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/support', search: { ticket: params.id, status: 'all' } });
  },
});

const aiRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'ai-engine',
  staticData: { crumb: 'AI engine' },
  component: AiEnginePage,
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
  staticData: { crumb: 'Integrations' },
  validateSearch: searchValidator(integrationsSearchSchema),
  component: IntegrationsPage,
});

export const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    dashboardRoute,
    contentRoute.addChildren([contentListRoute, contentImportRoute, contentItemRoute]),
    reviewRoute,
    usersRoute.addChildren([usersListRoute, userDetailRoute]),
    safetyRoute.addChildren([safetyListRoute, flagRoute]),
    supportRoute.addChildren([supportListRoute, ticketRoute]),
    aiRoute,
    settingsRoute.addChildren([settingsIndexRoute, integrationsRoute]),
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
