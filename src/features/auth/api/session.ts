// Session lifecycle: restore on load (`GET staff/auth/session`), keep the store in step with every
// session answer, re-read permissions after a refusal, and sign out. Nothing about the session is
// stored in the browser: the cookie is HttpOnly and the CSRF token stays in module memory.
import { ApiError, onSession, onSessionEnd, recheckSession } from '@/lib/api';
import { useSession } from '@/stores/session';
import { authApi } from './auth-api';

// Every session answer (sign-in, reload, re-check) updates the store; an ended session clears it.
onSession((info) => useSession.getState().setSession(info.staff, info.restricted));
onSessionEnd((reason) => {
  const s = useSession.getState();
  if (s.status === 'signedIn' || s.status === 'restricted') s.signOut(reason);
});

let restoring: Promise<void> | null = null;

/** Resolves once the session status is known. Runs the restore at most once at a time. */
export function ensureSession(): Promise<void> {
  if (useSession.getState().status !== 'unknown') return Promise.resolve();
  restoring ??= restore().finally(() => {
    restoring = null;
  });
  return restoring;
}

/** Waits before retrying a restore that hit a busy (429) or unavailable (5xx, network) API. */
const RESTORE_WAITS_MS = [1000, 3000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isTransient(e: unknown): boolean {
  if (!(e instanceof ApiError)) return true;
  return e.status == null || e.status === 429 || e.status >= 500;
}

async function restore(): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await authApi.session();
      return;
    } catch (e) {
      // 401 STAFF_SESSION_REQUIRED: nobody is signed in. A busy or briefly unreachable API is tried
      // again; after that, ask for a fresh sign-in rather than showing a broken panel.
      if (!isTransient(e) || attempt >= RESTORE_WAITS_MS.length) {
        useSession.getState().signOut(null);
        return;
      }
      await sleep(RESTORE_WAITS_MS[attempt]);
    }
  }
}

let rechecking: Promise<'signedIn' | 'restricted' | 'signedOut' | 'unchanged'> | null = null;
let lastRecheck = 0;
const RECHECK_GAP_MS = 5_000;

/**
 * The API refused a call for a missing permission: the account's roles changed since the session
 * was loaded (an Owner edited them). Re-reads the session once (single flight, at most every
 * 5 seconds) so `Can`, route guards and the sidebar follow.
 */
export function recheckPermissions(now = Date.now()): Promise<'signedIn' | 'restricted' | 'signedOut' | 'unchanged'> {
  if (rechecking) return rechecking;
  const status = useSession.getState().status;
  if ((status !== 'signedIn' && status !== 'restricted') || now - lastRecheck < RECHECK_GAP_MS)
    return Promise.resolve('unchanged');
  lastRecheck = now;
  rechecking = recheckSession()
    .then(
      (info) =>
        (info ? (info.restricted ? 'restricted' : 'signedIn') : 'signedOut') as 'signedIn' | 'restricted' | 'signedOut',
    )
    .catch(() => 'unchanged' as const)
    .finally(() => {
      rechecking = null;
    });
  return rechecking;
}

/** For tests. */
export function __resetSessionForTests(): void {
  rechecking = null;
  lastRecheck = 0;
  restoring = null;
}

export async function signOut(): Promise<void> {
  await authApi.logout().catch(() => undefined);
}
