import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { db } from '@/mocks/db';
import { server } from '@/mocks/node';
import { p } from '@/mocks/utils';
import { signInAs } from '@/test/utils';
import { api, apiUrl, onPermissionRefused, onSessionEnd, recheckSession } from './client';
import { getCsrfToken, setCsrfToken } from './csrf';
import { ApiError, errorMessage, isPermissionRefusal, shouldRetry } from './errors';

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

  it('429: says how long to wait, from retryAt or else from the Retry-After header', async () => {
    const soon = new Date(Date.now() + 42_000).toISOString();
    server.use(
      http.get(p('limited-body'), () =>
        HttpResponse.json({ statusCode: 429, message: 'x', code: 'RATE_LIMITED', retryAt: soon }, { status: 429 }),
      ),
      http.get(p('limited-header'), () =>
        HttpResponse.json(
          { statusCode: 429, message: 'ThrottlerException: Too Many Requests' },
          { status: 429, headers: { 'Retry-After': '30' } },
        ),
      ),
      http.get(p('limited-bare'), () => HttpResponse.json({ statusCode: 429, message: 'x' }, { status: 429 })),
    );
    const a = (await api.get('limited-body', { auth: false }).catch((e: unknown) => e)) as ApiError;
    expect(errorMessage(a)).toMatch(/^Too many requests\. Try again in 4[12] s\.$/);
    const b = (await api.get('limited-header', { auth: false }).catch((e: unknown) => e)) as ApiError;
    expect(errorMessage(b)).toMatch(/^Too many requests\. Try again in (29|30) s\.$/);
    const c = (await api.get('limited-bare', { auth: false }).catch((e: unknown) => e)) as ApiError;
    expect(errorMessage(c)).toBe('Too many requests. Wait a moment and try again.');
  });

  it('423 ACCOUNT_LOCKED says until when', async () => {
    const at = new Date(Date.now() + 15 * 60_000).toISOString();
    server.use(
      http.post(p('locked'), () =>
        HttpResponse.json({ statusCode: 423, message: 'Locked', code: 'ACCOUNT_LOCKED', retryAt: at }, { status: 423 }),
      ),
    );
    const e = (await api.post('locked', {}, { auth: false }).catch((x: unknown) => x)) as ApiError;
    expect(errorMessage(e)).toMatch(/^Too many failed attempts\. This account is locked until .+\.$/);
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

  it('every staff error code the API sends has clear copy', () => {
    const copy = (code: string) =>
      errorMessage(new ApiError('http', { status: 400, body: { message: 'server text', code } }));
    for (const code of [
      'CONFIRM_MISMATCH',
      'USER_NOT_FOUND',
      'INVALID_REASON',
      'INVALID_TAGS',
      'TICKET_NOT_FOUND',
      'FLAG_NOT_FOUND',
      'INVALID_CREDENTIALS',
      'MFA_INVALID',
      'MFA_REQUIRED_FOR_ROLE',
      'WEAK_PASSWORD',
      'CSRF_FAILED',
      'INSUFFICIENT_PERMISSION',
      'USERNAME_TAKEN',
      'SELF_ROLE_CHANGE',
      'LAST_OWNER',
      'SELF_ACTION',
      'INVALID_PERMISSIONS',
      'BUILTIN_ROLE',
      'ROLE_IN_USE',
      'TICKET_CONFLICT',
      'CONFIG_CONFLICT',
      'ASSIGNEE_NOT_ELIGIBLE',
      'REPLY_NOT_FOUND',
      'REPLY_ALREADY_SENT',
      'TICKET_TIMELINE_FULL',
      'INVALID_CONFIG',
      'CONFIG_UNCHANGED',
      'CONFIG_VERSION_NOT_FOUND',
      'FEATURE_DISABLED',
    ]) {
      expect(copy(code), code).not.toBe('server text');
    }
    expect(copy('INVALID_CREDENTIALS')).toBe('The username or password is not right.');
    expect(copy('LAST_OWNER')).toBe('This would leave no active Owner. Make someone else an Owner first.');
  });
});

describe('cookies, CSRF and Idempotency-Key', () => {
  it('sends credentials with every call, X-CSRF-Token and Idempotency-Key only on writes', async () => {
    setCsrfToken('csrf-123');
    // The fetch init carries `credentials: 'include'` (the interceptor's Request does not keep it).
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const seen: Record<string, { csrf: string | null; idem: string | null }> = {};
    const record =
      (k: string) =>
      ({ request }: { request: Request }) => {
        seen[k] = {
          csrf: request.headers.get('x-csrf-token'),
          idem: request.headers.get('idempotency-key'),
        };
        return k === 'delete' ? new HttpResponse(null, { status: 204 }) : HttpResponse.json({});
      };
    server.use(
      http.get(p('echo'), record('get')),
      http.post(p('echo'), record('post')),
      http.put(p('echo'), record('put')),
      http.patch(p('echo'), record('patch')),
      http.delete(p('echo'), record('delete')),
    );
    await api.get('echo', { auth: false });
    await api.post('echo', {}, { auth: false });
    await api.put('echo', {}, { auth: false });
    await api.patch('echo', {}, { auth: false });
    await api.delete('echo', undefined, { auth: false });
    expect(seen.get).toEqual({ csrf: null, idem: null });
    for (const k of ['post', 'put', 'patch', 'delete']) {
      expect(seen[k]!.csrf, k).toBe('csrf-123');
      expect(seen[k]!.idem, k).toMatch(/^panel-.{8,}/);
      expect(seen[k]!.idem!.length).toBeLessThanOrEqual(80);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    for (const [, init] of fetchSpy.mock.calls) expect((init as RequestInit).credentials).toBe('include');
    expect(seen.post!.idem).not.toBe(seen.delete!.idem);
  });

  it('CSRF_FAILED: reads the session again for a fresh token and retries once, same Idempotency-Key', async () => {
    signInAs(['owner']);
    const real = getCsrfToken();
    setCsrfToken('stale-token');
    const sent: { csrf: string | null; idem: string | null }[] = [];
    let sessionCalls = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/staff/auth/session')) sessionCalls += 1;
    });
    server.use(
      http.post(p('admin/thing'), ({ request }) => {
        const csrf = request.headers.get('x-csrf-token');
        sent.push({ csrf, idem: request.headers.get('idempotency-key') });
        if (csrf !== real)
          return HttpResponse.json({ statusCode: 403, message: 'CSRF', code: 'CSRF_FAILED' }, { status: 403 });
        return HttpResponse.json({ ok: true });
      }),
    );
    await expect(api.post('admin/thing', { a: 1 })).resolves.toEqual({ ok: true });
    server.events.removeAllListeners();
    expect(sessionCalls).toBe(1);
    expect(sent.map((s) => s.csrf)).toEqual(['stale-token', real]);
    expect(sent[0]!.idem).toBe(sent[1]!.idem);
  });
});

describe('401: single-flight session re-check', () => {
  it('runs one GET staff/auth/session for concurrent 401s and retries each call once', async () => {
    signInAs(['owner']);
    let sessionCalls = 0;
    let n = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/staff/auth/session')) sessionCalls += 1;
    });
    server.use(
      http.get(p('admin/flaky'), () => {
        n += 1;
        return n <= 3
          ? HttpResponse.json({ statusCode: 401, message: 'x', code: 'STAFF_SESSION_REQUIRED' }, { status: 401 })
          : HttpResponse.json({ ok: n });
      }),
    );
    const results = await Promise.all([api.get('admin/flaky'), api.get('admin/flaky'), api.get('admin/flaky')]);
    server.events.removeAllListeners();
    expect(sessionCalls).toBe(1);
    expect(results).toHaveLength(3);
  });

  it('shares one in-flight re-check between callers', async () => {
    signInAs(['owner']);
    const a = recheckSession();
    const b = recheckSession();
    expect(a).toBe(b);
    await expect(a).resolves.toMatchObject({ staff: { roles: ['owner'] } });
  });

  it('ends the session (and drops the CSRF token) when no session is left', async () => {
    signInAs(['owner']);
    db().staff.sessions.clear();
    const ended = vi.fn();
    const off = onSessionEnd(ended);
    const err = (await api.get('admin/stats').catch((e: unknown) => e)) as ApiError;
    off();
    expect(err.kind).toBe('unauthorized');
    expect(ended).toHaveBeenCalledWith('expired');
    expect(getCsrfToken()).toBeNull();
  });

  it('sign-in routes (auth: false) never re-check: a 401 there is a wrong password', async () => {
    let sessionCalls = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/staff/auth/session')) sessionCalls += 1;
    });
    const e = (await api
      .post('staff/auth/login', { username: 'owner', password: 'wrong-password-123' }, { auth: false })
      .catch((x: unknown) => x)) as ApiError;
    server.events.removeAllListeners();
    expect(e.code).toBe('INVALID_CREDENTIALS');
    expect(sessionCalls).toBe(0);
  });
});

describe('permission refusals (403 INSUFFICIENT_PERMISSION)', () => {
  it('notify listeners without ending the session; a CSRF failure does not count', async () => {
    signInAs(['analyst']);
    const refused = vi.fn();
    const ended = vi.fn();
    const offP = onPermissionRefused(refused);
    const offE = onSessionEnd(ended);
    const e = await api.get('admin/users').catch((x: unknown) => x);
    expect(isPermissionRefusal(e)).toBe(true);
    expect(errorMessage(e)).toBe('Not available for your role.');
    expect(refused).toHaveBeenCalledTimes(1);
    expect(ended).not.toHaveBeenCalled();
    server.use(
      http.get(p('csrf'), () =>
        HttpResponse.json({ statusCode: 403, message: 'x', code: 'CSRF_FAILED' }, { status: 403 }),
      ),
    );
    const c = await api.get('csrf').catch((x: unknown) => x);
    expect(isPermissionRefusal(c)).toBe(false);
    expect(refused).toHaveBeenCalledTimes(1);
    offP();
    offE();
  });
});
