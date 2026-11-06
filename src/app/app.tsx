import { RouterProvider } from '@tanstack/react-router';
import * as React from 'react';
import { recheckPermissions } from '@/features/auth/api/session';
import { onPermissionRefused, onSessionEnd } from '@/lib/api';
import { createQueryClient } from '@/lib/query-client';
import { Providers } from './providers';
import { createAppRouter } from './router';

export function App() {
  const [queryClient] = React.useState(() => createQueryClient());
  const [router] = React.useState(() => createAppRouter(queryClient));

  // The session ended (expired, revoked, signed out): forget every cached answer. AppLayout sends
  // the person to sign-in.
  React.useEffect(() => onSessionEnd(() => queryClient.clear()), [queryClient]);

  // A 403 for a missing permission means the session's permissions are out of date: re-read them
  // (the gates follow the store; a restricted or ended session goes to sign-in from AppLayout).
  React.useEffect(() => onPermissionRefused(() => void recheckPermissions()), []);

  return (
    <Providers queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>
  );
}
