import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { db } from '@/mocks/db';
import { server } from '@/mocks/node';
import { p } from '@/mocks/utils';
import { api, apiUrl, onRoleRefused, onSessionEnd, refreshSession } from './client';
import { ApiError, errorMessage, isRoleRefusal, shouldRetry } from './errors';
import { getAccessToken, getRefreshToken, setTokens } from './tokens';

/** Signs in through the mock auth routes and returns the issued tokens. */
async function signIn(email = 'lead@thirdwheel.app') {
  const start = await api.post<{ session: string }>('auth/login/start', { email }, { auth: false });
  const v = await api.post<{ token: string; refreshToken: string; expiresIn: number }>(
    'auth/verify',
    { session: start.session, code: '123456' },
    { auth: false },
  );
  setTokens(v);
  return v;
}

describe('apiUrl', () => {
  it('joins the base and path and drops empty query values', () => {
    const url = new URL(apiUrl('admin/users', { q: 'sara', page: 2, tag: '', plan: undefined }));
    expect(url.pathname).toBe('/api/v1/admin/users');
    expect(url.searchParams.get('q')).toBe('sara');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.has('tag')).toBe(false);
    expect(url.searchParams.has('plan')).toBe(false);
  });
});

describe('error mapping', () => {
  it('maps the server error body to ApiError with code and requestId', async () => {
    server.use(
      http.get(p('boom'), () =>
        HttpResponse.json(
          { statusCode: 409, message: 'Already exists', code: 'CONTENT_EXISTS', requestId: 'req-1' },
          { status: 409 },
        ),
      ),
    );
    const err = await api.get('boom', { auth: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const e = err as ApiError;
    expect(e.status).toBe(409);
    expect(e.code).toBe('CONTENT_EXISTS');
    expect(e.requestId).toBe('req-1');
    expect(e.isClientError).toBe(true);
    expect(errorMessage(e)).toBe('An item with this id already exists.');
  });

  it('joins validation message arrays', async () => {
    server.use(
      http.get(p('bad'), () =>
        HttpResponse.json(
          { statusCode: 400, message: ['title is too long', 'minutes must be ≤ 600'] },
          { status: 400 },
        ),
      ),
    );
    const e = (await api.get('bad', { auth: false }).catch((x: unknown) => x)) as ApiError;
    expect(e.message).toBe('title is too long, minutes must be ≤ 600');
  });

  it('reports network failures as transient', async () => {
    server.use(http.get(p('down'), () => HttpResponse.error()));
    const e = (await api.get('down', { auth: false }).catch((x: unknown) => x)) as ApiError;
    expect(e.kind).toBe('network');
    expect(e.isTransient).toBe(true);
  });

  it('retries GETs only on network errors and 5xx', () => {
    expect(shouldRetry(0, new ApiError('network'))).toBe(true);
    expect(shouldRetry(0, new ApiError('http', { status: 503 }))).toBe(true);
    expect(shouldRetry(0, new ApiError('http', { status: 404 }))).toBe(false);
    expect(shouldRetry(0, new ApiError('http', { status: 400 }))).toBe(false);
    expect(shouldRetry(2, new ApiError('network'))).toBe(false);
  });
});

describe('Idempotency-Key', () => {
  it('is sent on mutating calls and not on reads', async () => {
    const seen: Record<string, string | null> = {};
    server.use(
      http.get(p('echo'), ({ request }) => {
        seen.get = request.headers.get('idempotency-key');
        return HttpResponse.json({});
      }),
      http.post(p('echo'), ({ request }) => {
        seen.post = request.headers.get('idempotency-key');
        return HttpResponse.json({});
      }),
      http.delete(p('echo'), ({ request }) => {
        seen.del = request.headers.get('idempotency-key');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await api.get('echo', { auth: false });
    await api.post('echo', {}, { auth: false });
    await api.delete('echo', undefined, { auth: false });
    expect(seen.get).toBeNull();
    expect(seen.post).toMatch(/^panel-.{8,}/);
    expect(seen.post!.length).toBeLessThanOrEqual(80);
    expect(seen.del).toMatch(/^panel-/);
    expect(seen.post).not.toBe(seen.del);
  });

  it('keeps the same key when a write is retried after a refresh', async () => {
    await signIn();
    const keys: string[] = [];
    let first = true;
    server.use(
      http.post(p('admin/thing'), ({ request }) => {
        keys.push(request.headers.get('idempotency-key') ?? '');
        if (first) {
          first = false;
          return HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      }),
    );
    await expect(api.post('admin/thing', { a: 1 })).resolves.toEqual({ ok: true });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });
});

describe('refresh flow', () => {
  it('runs a single refresh for concurrent 401s and retries each call once', async () => {
    const { token } = await signIn();
    // Invalidate the access token server side so the next calls get 401.
    db().auth.access.delete(token);
    let refreshCalls = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/auth/refresh')) refreshCalls += 1;
    });
    const results = await Promise.all([api.get('admin/me'), api.get('admin/me'), api.get('admin/me')]);
    server.events.removeAllListeners();
    expect(refreshCalls).toBe(1);
    expect(results.every((r) => (r as { email: string }).email === 'lead@thirdwheel.app')).toBe(true);
    expect(getAccessToken()).not.toBe(token);
  });

  it('shares one in-flight refresh between callers', async () => {
    await signIn();
    const a = refreshSession();
    const b = refreshSession();
    expect(a).toBe(b);
    await expect(a).resolves.toBe(true);
  });

  it('ends the session when the refresh token is refused', async () => {
    const { token, refreshToken } = await signIn();
    db().auth.access.delete(token);
    db().auth.refresh.delete(refreshToken);
    const ended = vi.fn();
    const off = onSessionEnd(ended);
    const err = (await api.get('admin/me').catch((e: unknown) => e)) as ApiError;
    off();
    expect(err.kind).toBe('unauthorized');
    expect(ended).toHaveBeenCalledWith('refresh_failed');
    expect(getRefreshToken()).toBeNull();
  });

  it('refreshes before calling when there is no access token in memory (page reload)', async () => {
    await signIn();
    const refresh = getRefreshToken()!;
    // Simulate a reload: memory is gone, sessionStorage keeps the refresh token.
    setTokens({ token: 'stale', refreshToken: refresh, expiresIn: -60 });
    const me = await api.get<{ roles: string[] }>('admin/me');
    expect(me.roles).toEqual(['admin', 'clinician']);
    expect(getRefreshToken()).not.toBe(refresh);
  });

  it('ends the session on 403 ACCOUNT_SUSPENDED', async () => {
    await signIn();
    server.use(
      http.get(p('admin/stats'), () =>
        HttpResponse.json({ statusCode: 403, message: 'Suspended', code: 'ACCOUNT_SUSPENDED' }, { status: 403 }),
      ),
    );
    const ended = vi.fn();
    const off = onSessionEnd(ended);
    await expect(api.get('admin/stats')).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    off();
    expect(ended).toHaveBeenCalledWith('suspended');
  });
});

describe('role refusals (403 INSUFFICIENT_ROLE)', () => {
  it('notify role listeners without ending the session; a suspension does not count', async () => {
    await signIn();
    const refused = vi.fn();
    const ended = vi.fn();
    const offRole = onRoleRefused(refused);
    const offEnd = onSessionEnd(ended);
    server.use(
      http.get(p('role'), () =>
        HttpResponse.json(
          { statusCode: 403, message: 'Insufficient role', code: 'INSUFFICIENT_ROLE' },
          { status: 403 },
        ),
      ),
      http.get(p('suspended'), () =>
        HttpResponse.json({ statusCode: 403, message: 'Suspended', code: 'ACCOUNT_SUSPENDED' }, { status: 403 }),
      ),
    );
    const e = await api.get('role').catch((x: unknown) => x);
    expect(isRoleRefusal(e)).toBe(true);
    expect(errorMessage(e)).toBe('Not available for your role.');
    expect(refused).toHaveBeenCalledTimes(1);
    expect(ended).not.toHaveBeenCalled();
    expect(getRefreshToken()).not.toBeNull();
    await signIn();
    const s = await api.get('suspended').catch((x: unknown) => x);
    expect(isRoleRefusal(s)).toBe(false);
    expect(refused).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith('suspended');
    offRole();
    offEnd();
  });

  it('every admin error code the API sends has clear copy', () => {
    const copy = (code: string) =>
      errorMessage(new ApiError('http', { status: 400, body: { message: 'server text', code } }));
    for (const code of [
      'CONFIRM_MISMATCH',
      'STAFF_ACCOUNT',
      'SELF_ACTION',
      'USER_NOT_FOUND',
      'INVALID_REASON',
      'INVALID_TAGS',
      'INVALID_DAYS',
      'INVALID_NOTE',
      'TICKET_NOT_FOUND',
      'SCREENSHOT_NOT_FOUND',
      'FLAG_NOT_FOUND',
      'ACCOUNT_SUSPENDED',
      'INSUFFICIENT_ROLE',
    ]) {
      expect(copy(code)).not.toBe('server text');
    }
    expect(copy('STAFF_ACCOUNT')).toBe('Staff accounts cannot be deleted here.');
    expect(copy('CONFIRM_MISMATCH')).toBe('The email you typed does not match this account.');
  });
});
