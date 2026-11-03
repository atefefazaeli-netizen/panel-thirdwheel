import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, type RenderOptions } from '@testing-library/react';
import type * as React from 'react';
import { createAppRouter } from '@/app/router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setTokens } from '@/lib/api/tokens';
import { db } from '@/mocks/db';
import { useSession, type StaffUser } from '@/stores/session';

export function testQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
}

export function renderWithProviders(ui: React.ReactElement, opts: RenderOptions & { queryClient?: QueryClient } = {}) {
  const queryClient = opts.queryClient ?? testQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
    opts,
  );
  return { ...result, queryClient };
}

/** Signs a staff member in for a test: session store + a valid mock access token. */
export function signInAs(roles: string[] = ['admin', 'clinician'], email = 'lead@thirdwheel.app'): StaffUser {
  const user: StaffUser = { userId: 'stf_test', email, roles };
  const token = `mock_at_test_${roles.join('_') || 'none'}`;
  db().auth.access.set(token, { user, exp: Date.now() + 15 * 60_000 });
  db().auth.refresh.set('mock_rt_test_refresh_token_0000000000', user);
  setTokens({ token, refreshToken: 'mock_rt_test_refresh_token_0000000000', expiresIn: 900 });
  useSession.getState().signIn(user);
  return user;
}

/** Renders the full app router at a path (signed in unless roles is null). */
export function renderRoute(path: string, opts: { roles?: string[] | null } = {}) {
  if (opts.roles !== null) signInAs(opts.roles ?? ['admin', 'clinician']);
  else useSession.setState({ status: 'unknown', user: null });
  const queryClient = testQueryClient();
  const router = createAppRouter(queryClient, { history: createMemoryHistory({ initialEntries: [path] }) });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...result, router, queryClient };
}
