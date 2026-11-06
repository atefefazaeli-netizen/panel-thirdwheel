import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { getCsrfToken } from '@/lib/api/csrf';
import { db } from '@/mocks/db';
import { server } from '@/mocks/node';
import { p } from '@/mocks/utils';
import { useSession } from '@/stores/session';
import { signInAs } from '@/test/utils';
import { ensureSession, recheckPermissions } from './session';

/** A reload: the store and the CSRF token are gone, only the (HttpOnly) cookie is left. */
function reload() {
  useSession.setState({ status: 'unknown', staff: null, restricted: null });
}

describe('ensureSession (page reload)', () => {
  it('restores the session from GET staff/auth/session and keeps the CSRF token in memory', async () => {
    const me = signInAs(['content_editor']);
    reload();
    await ensureSession();
    expect(useSession.getState()).toMatchObject({
      status: 'signedIn',
      staff: { id: me.id, roles: ['content_editor'] },
    });
    expect(getCsrfToken()).toBeTruthy();
  });

  it('rides out a rate-limited session check and signs in on the retry', async () => {
    signInAs(['owner']);
    reload();
    let calls = 0;
    server.use(
      http.get(p('staff/auth/session'), () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ statusCode: 429, message: 'Too Many Requests' }, { status: 429 });
        return undefined; // fall through to the mock API
      }),
    );
    await ensureSession();
    expect(calls).toBe(2);
    expect(useSession.getState().status).toBe('signedIn');
  });

  it('asks for a sign-in when there is no session (401 STAFF_SESSION_REQUIRED)', async () => {
    reload();
    await ensureSession();
    expect(useSession.getState().status).toBe('signedOut');
  });

  it('a restricted session reloads as restricted (it must finish its step)', async () => {
    signInAs(['support_agent'], 'temp.reload');
    const sid = db().staff.jar!;
    db().staff.sessions.get(sid)!.restricted = 'password_change';
    reload();
    await ensureSession();
    expect(useSession.getState()).toMatchObject({ status: 'restricted', restricted: 'password_change' });
  });
});

describe('recheckPermissions (roles changed on the server)', () => {
  it('re-reads the session so gates follow a removed permission, at most every 5 seconds', async () => {
    signInAs(['user_moderator'], 'mod.recheck');
    const account = db().staff.accounts.find((a) => a.username === 'mod.recheck')!;
    account.roles = ['analyst'];
    let calls = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/staff/auth/session')) calls += 1;
    });
    await expect(recheckPermissions(1_000_000)).resolves.toBe('signedIn');
    expect(useSession.getState().staff?.permissions).toContain('config.read');
    expect(useSession.getState().staff?.permissions).not.toContain('users.read');
    await expect(recheckPermissions(1_002_000)).resolves.toBe('unchanged');
    server.events.removeAllListeners();
    expect(calls).toBe(1);
  });

  it('moves to signed out when the session was revoked', async () => {
    signInAs(['owner']);
    db().staff.sessions.clear();
    await expect(recheckPermissions(2_000_000)).resolves.toBe('signedOut');
    expect(useSession.getState()).toMatchObject({ status: 'signedOut', endedReason: 'expired' });
  });
});
