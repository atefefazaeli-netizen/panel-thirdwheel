// Code-based route tree. Every list page validates its search params with Zod, so filters live
// in the URL (shareable, back/forward friendly). Auth guards run in beforeLoad.
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouter, Outlet, redirect } from '@tanstack/react-router';
import { ensureSession } from '@/features/auth/api/session';
import { LoginPage } from '@/features/auth/routes/login-page';
import { loginSearchSchema } from '@/features/auth/schemas/search';
import { searchValidator } from '@/lib/search';
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

export const routeTree = rootRoute.addChildren([loginRoute, appRoute.addChildren([dashboardRoute])]);

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
