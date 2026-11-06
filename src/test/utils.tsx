import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, type RenderOptions } from '@testing-library/react';
import type * as React from 'react';
import { createAppRouter } from '@/app/router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setCsrfToken } from '@/lib/api/csrf';
import { staffId, staffMe, type StaffAccount } from '@/mocks/data/staff';
import { db } from '@/mocks/db';
import { openSessionFor } from '@/mocks/handlers/auth';
import { useSession, type StaffMe } from '@/stores/session';

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

/**
 * Signs a staff member in for a test: a mock staff account with these roles (built-in or custom
 * role keys), a live mock session (the "cookie"), the CSRF token in the client's memory, and the
 * session store. Permissions are computed from the roles exactly as the mock server does.
 */
export function signInAs(roles: string[] = ['owner'], username = `test.${roles.join('.') || 'none'}`): StaffMe {
  const s = db().staff;
  let account = s.accounts.find((a) => a.username === username);
  if (!account) {
    account = {
      id: staffId(username),
      username,
      displayName: `Test ${roles.join(' + ') || 'nobody'}`,
      roles,
      password: 'test-password-long',
      disabled: false,
      mfaSecret: null,
      pendingSecret: null,
      recoveryCodes: [],
      lastStep: -1,
      mustChangePassword: false,
      failures: 0,
      lockouts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
    } satisfies StaffAccount;
    s.accounts.push(account);
  }
  const { session } = openSessionFor(account);
  setCsrfToken(session.csrfToken);
  const me = staffMe(account, s.customRoles) as StaffMe;
  useSession.getState().setSession(me);
  return me;
}

/** Renders the full app router at a path (signed in with these roles unless roles is null). */
export function renderRoute(path: string, opts: { roles?: string[] | null; username?: string } = {}) {
  if (opts.roles !== null) signInAs(opts.roles ?? ['owner'], opts.username);
  else useSession.setState({ status: 'unknown', staff: null, restricted: null });
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
