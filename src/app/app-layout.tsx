import { Outlet, useNavigate } from '@tanstack/react-router';
import { AppShell } from '@/components/shared';
import { env } from '@/config/env';
import { signOut } from '@/features/auth/api/session';
import { useSession } from '@/stores/session';
import { useNavBadges } from './nav-badges';

function MockBanner() {
  return (
    <div className="border-b bg-warning-soft px-4 py-1.5 text-center text-xs font-medium text-warning" role="status">
      Mock API: sample data in this browser, reset on reload.
    </div>
  );
}

export function AppLayout() {
  const user = useSession((s) => s.user);
  const navigate = useNavigate();
  const badges = useNavBadges();
  return (
    <AppShell
      user={user}
      badges={badges}
      banner={env.useMocks ? <MockBanner /> : undefined}
      onSignOut={async () => {
        await signOut();
        await navigate({ to: '/login' });
      }}
    >
      <Outlet />
    </AppShell>
  );
}
