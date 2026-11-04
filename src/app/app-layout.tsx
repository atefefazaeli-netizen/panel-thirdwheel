import { Outlet, useNavigate } from '@tanstack/react-router';
import { AppShell, DemoBanner } from '@/components/shared';
import { env } from '@/config/env';
import { signOut } from '@/features/auth/api/session';
import { useSession } from '@/stores/session';
import { useNavBadges } from './nav-badges';

export function AppLayout() {
  const user = useSession((s) => s.user);
  const navigate = useNavigate();
  const badges = useNavBadges();
  return (
    <AppShell
      user={user}
      badges={badges}
      banner={env.useMocks ? <DemoBanner /> : undefined}
      onSignOut={async () => {
        await signOut();
        await navigate({ to: '/login' });
      }}
    >
      <Outlet />
    </AppShell>
  );
}
