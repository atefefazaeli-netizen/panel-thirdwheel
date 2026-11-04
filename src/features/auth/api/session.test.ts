import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { setTokens } from '@/lib/api/tokens';
import { server } from '@/mocks/node';
import { p } from '@/mocks/utils';
import { useSession } from '@/stores/session';
import { __resetRecheckForTests, ensureSession, recheckRoles } from './session';

const staff = { userId: 'u1', email: 'lead@thirdwheel.app', roles: ['user', 'admin'] };

/** A reload: no access token in memory, only the refresh token. */
function reloadWithRefreshToken() {
  setTokens({ token: 'old', refreshToken: 'rt_1', expiresIn: -1 });
  useSession.setState({ status: 'unknown', user: null });
}

describe('ensureSession (page reload)', () => {
  beforeEach(reloadWithRefreshToken);

  it('rides out a rate-limited refresh and signs in on the retry', async () => {
    let calls = 0;
    server.use(
      http.post(p('auth/refresh'), () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ statusCode: 429, message: 'Too Many Requests' }, { status: 429 })
          : HttpResponse.json({ token: 'fresh', refreshToken: 'rt_2', expiresIn: 900 });
      }),
      http.get(p('admin/me'), () => HttpResponse.json(staff)),
    );
    await ensureSession();
    expect(calls).toBe(2);
    expect(useSession.getState()).toMatchObject({ status: 'signedIn', user: staff });
  });

  it('asks for a fresh sign-in when the refresh token is refused', async () => {
    server.use(
      http.post(p('auth/refresh'), () =>
        HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 }),
      ),
    );
    await ensureSession();
    expect(useSession.getState().status).toBe('signedOut');
  });
});

describe('recheckRoles (roles changed on the server)', () => {
  beforeEach(() => {
    __resetRecheckForTests();
    setTokens({ token: 'live', refreshToken: 'rt_live', expiresIn: 900 });
    useSession.getState().signIn({ ...staff, roles: ['user', 'admin', 'clinician'] });
  });

  it('re-reads admin/me so the role gates follow a removed role', async () => {
    let calls = 0;
    server.use(http.get(p('admin/me'), () => (calls++, HttpResponse.json({ ...staff, roles: ['user', 'clinician'] }))));
    await expect(recheckRoles(1_000_000)).resolves.toBe('signedIn');
    expect(useSession.getState().user?.roles).toEqual(['user', 'clinician']);
    // At most once every 5 seconds.
    await expect(recheckRoles(1_002_000)).resolves.toBe('unchanged');
    expect(calls).toBe(1);
  });

  it('moves to no access when no staff role is left', async () => {
    server.use(
      http.get(p('admin/me'), () =>
        HttpResponse.json(
          { statusCode: 403, message: 'Insufficient role', code: 'INSUFFICIENT_ROLE' },
          { status: 403 },
        ),
      ),
      http.post(p('auth/logout'), () => new HttpResponse(null, { status: 204 })),
    );
    await expect(recheckRoles(2_000_000)).resolves.toBe('noAccess');
    expect(useSession.getState().status).toBe('noAccess');
  });
});
