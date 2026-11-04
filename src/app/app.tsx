import { RouterProvider } from '@tanstack/react-router';
import * as React from 'react';
import { recheckRoles } from '@/features/auth/api/session';
import { onRoleRefused, onSessionEnd } from '@/lib/api';
import { createQueryClient } from '@/lib/query-client';
import { useSession } from '@/stores/session';
import { Providers } from './providers';
import { createAppRouter } from './router';

export function App() {
  const [queryClient] = React.useState(() => createQueryClient());
  const [router] = React.useState(() => createAppRouter(queryClient));

  React.useEffect(
    () =>
      onSessionEnd((reason) => {
        queryClient.clear();
        useSession.getState().signOut(reason);
        if (reason !== 'signed_out')
          void router.navigate({ to: '/login', search: { redirect: router.state.location.href } });
      }),
    [queryClient, router],
  );

  // A 403 INSUFFICIENT_ROLE means the roles loaded at sign-in are out of date: re-read them.
  React.useEffect(
    () =>
      onRoleRefused(() => {
        void recheckRoles().then((r) => {
          if (r === 'noAccess') void router.navigate({ to: '/login' });
        });
      }),
    [router],
  );

  return (
    <Providers queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>
  );
}
