// Development-only UI for the mock API: a banner on every page and the dev sign-in hint. Loaded by
// main.tsx only when `import.meta.env.DEV` is true, so it never reaches a production build.
import { TriangleAlertIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { DEV_ACCOUNTS, DEV_OWNER_TOTP_SECRET, DEV_PASSWORD } from './data/staff';
import { totp } from './totp';

export function DevMockBanner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="dev-mock-banner"
      className={cn(
        'flex items-center justify-center gap-2 border-b border-destructive/30 bg-destructive px-4 py-2 text-center text-sm font-semibold text-white',
        className,
      )}
    >
      <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
      <span>Development mock API: nothing here is real, and it resets on reload.</span>
    </div>
  );
}

/** The current TOTP code for the dev Owner, refreshed every second. */
function useDevOwnerCode() {
  const [code, setCode] = React.useState('');
  React.useEffect(() => {
    let alive = true;
    const tick = () => void totp(DEV_OWNER_TOTP_SECRET).then((c) => alive && setCode(c));
    tick();
    const t = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return code;
}

export function DevLoginHint() {
  const code = useDevOwnerCode();
  return (
    <aside
      className="w-full max-w-sm rounded-lg border border-dashed bg-card p-4 text-sm"
      aria-label="Development sign-in"
    >
      <p className="font-semibold">Development mock API</p>
      <p className="text-muted-foreground">
        Password for every account: <span className="font-mono">{DEV_PASSWORD}</span>. Owner code now:{' '}
        <span className="font-mono" data-testid="dev-owner-code">
          {code}
        </span>
      </p>
      <ul className="mt-2 flex flex-col gap-0.5">
        {DEV_ACCOUNTS.map((a) => (
          <li key={a.username}>
            <span className="font-mono">{a.username}</span> <span className="text-muted-foreground">· {a.what}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
