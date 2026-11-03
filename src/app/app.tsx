import { RouterProvider } from '@tanstack/react-router';
import * as React from 'react';
import { onSessionEnd } from '@/lib/api';
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

  return (
    <Providers queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>
  );
}
