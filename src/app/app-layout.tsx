import { Outlet, useMatches, useNavigate, useRouterState } from '@tanstack/react-router';
import * as React from 'react';
import { AppShell, ForbiddenState } from '@/components/shared';
import { devUi } from '@/config/dev-ui';
import { signOut } from '@/features/auth/api/session';
import type { Permission } from '@/lib/permissions';
import { hasPermissions, useSession } from '@/stores/session';
import { useNavBadges } from './nav-badges';

/**
 * Route-level permission guard: every matched route's `staticData.permission` must be held, or the
 * page shows "Not available for your role" (a deep link from a webhook, a bookmark, a role that
 * changed). The API refuses the same calls.
 */
function GuardedOutlet() {
  const staff = useSession((s) => s.staff);
  const needs = useMatches({
    select: (ms) => ms.map((m) => m.staticData?.permission).filter((p): p is Permission | Permission[] => !!p),
  });
  if (needs.some((p) => !hasPermissions(staff, p))) return <ForbiddenState />;
  return <Outlet />;
}

export function AppLayout() {
  const staff = useSession((s) => s.staff);
  const status = useSession((s) => s.status);
  const navigate = useNavigate();
  const href = useRouterState({ select: (s) => s.location.href });

  // The session ended (expired, revoked by an Owner, signed out in another tab) or became
  // restricted: go to sign-in, and come back to this page afterwards.
  React.useEffect(() => {
    if (status === 'signedOut' || status === 'restricted')
      void navigate({ to: '/login', search: { redirect: href === '/' ? undefined : href }, replace: true });
    // Only when the status changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const badges = useNavBadges();
  const { Banner } = devUi();
  return (
    <AppShell
      staff={staff}
      badges={badges}
      banner={Banner ? <Banner /> : undefined}
      onSignOut={async () => {
        await signOut();
        await navigate({ to: '/login' });
      }}
    >
      <GuardedOutlet />
    </AppShell>
  );
}
