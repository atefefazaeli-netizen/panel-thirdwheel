// Session lifecycle: restore on load (refresh token in sessionStorage → new access token →
// admin/me), finish sign-in after a code check, and sign out.
import { ApiError, endSession, getRefreshToken, refreshSession, setTokens, type TokenPair } from '@/lib/api';
import { useSession } from '@/stores/session';
import { authApi } from './auth-api';

let restoring: Promise<void> | null = null;

/** Resolves once the session status is known. Runs the restore at most once per page load. */
export function ensureSession(): Promise<void> {
  if (useSession.getState().status !== 'unknown') return Promise.resolve();
  restoring ??= restore().finally(() => {
    restoring = null;
  });
  return restoring;
}

async function restore(): Promise<void> {
  if (!getRefreshToken()) {
    useSession.getState().signOut(null);
    return;
  }
  try {
    if (!(await refreshSession())) {
      useSession.getState().signOut(null);
      return;
    }
    await loadStaff();
  } catch {
    // API unreachable: ask for a fresh sign-in rather than showing a broken panel.
    useSession.getState().signOut(null);
  }
}

/** Calls admin/me and records the result: signed in, or no panel access (403). */
export async function loadStaff(email?: string): Promise<'signedIn' | 'noAccess'> {
  try {
    const me = await authApi.me();
    useSession.getState().signIn(me);
    return 'signedIn';
  } catch (e) {
    if (e instanceof ApiError && e.status === 403 && e.code !== 'ACCOUNT_SUSPENDED') {
      // A real account without a staff role: end its tokens here, it has nothing to do in the panel.
      await authApi.logout().catch(() => undefined);
      endSession('signed_out');
      useSession.getState().deny(email ?? null);
      return 'noAccess';
    }
    throw e;
  }
}

export async function completeSignIn(tokens: TokenPair, email: string): Promise<'signedIn' | 'noAccess'> {
  setTokens(tokens);
  return loadStaff(email);
}

export async function signOut(): Promise<void> {
  await authApi.logout().catch(() => undefined);
  endSession('signed_out');
}
