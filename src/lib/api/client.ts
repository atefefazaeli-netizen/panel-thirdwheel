// Typed fetch wrapper for the Thirdwheel API.
// - Base URL from VITE_API_URL (default `/api/v1`, proxied by the Vite dev server).
// - Bearer access token from memory. A 401 triggers one refresh (single flight: concurrent
//   callers share it) and one retry. A refused refresh ends the session.
// - Mutating calls (POST, PUT, PATCH, DELETE) send an `Idempotency-Key` so a retried request is
//   never applied twice by the server.
// - Failures throw ApiError with the server's `code`, `requestId` and `retryAt`.
import { env } from '@/config/env';
import { ApiError, type ApiErrorBody } from './errors';
import { clearTokens, getAccessToken, getRefreshToken, peekAccessToken, setTokens, type TokenPair } from './tokens';
import type { Query } from './types';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** Send the bearer token (default true). Sign-in routes pass false. */
  auth?: boolean;
  /** Override the generated Idempotency-Key, or `false` to send none. */
  idempotencyKey?: string | false;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** `blob` for files (support screenshots). */
  responseType?: 'json' | 'blob';
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const MUTATING: ReadonlySet<Method> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type SessionEndReason = 'refresh_failed' | 'suspended' | 'signed_out';
const sessionEndListeners = new Set<(reason: SessionEndReason) => void>();

/** Called when the session ends (refresh refused, account suspended, sign out). */
export function onSessionEnd(fn: (reason: SessionEndReason) => void): () => void {
  sessionEndListeners.add(fn);
  return () => {
    sessionEndListeners.delete(fn);
  };
}

export function endSession(reason: SessionEndReason): void {
  clearTokens();
  sessionEndListeners.forEach((fn) => {
    try {
      fn(reason);
    } catch {
      // A listener must not stop the others.
    }
  });
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `panel-${crypto.randomUUID()}`;
  return `panel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function newRequestId(): string {
  return `panel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Absolute URL for an API path. Works with a relative base (`/api/v1`) and in tests. */
export function apiUrl(path: string, query?: Query): string {
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost';
  const base = new URL(env.apiUrl.endsWith('/') ? env.apiUrl : `${env.apiUrl}/`, origin);
  const url = new URL(path.replace(/^\/+/, ''), base);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

interface RawResult {
  status: number;
  body: unknown;
  requestId: string | null;
  /** `Retry-After` (seconds) on a 429; readable cross-origin because the API exposes it. */
  retryAfter?: number | null;
}

async function send(
  method: Method,
  path: string,
  opts: RequestOptions,
  token: string | null,
  idemKey: string | null,
): Promise<RawResult> {
  const requestId = newRequestId();
  const headers: Record<string, string> = { Accept: 'application/json', 'x-request-id': requestId, ...opts.headers };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idemKey) headers['Idempotency-Key'] = idemKey;

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort);

  try {
    let res: Response;
    try {
      res = await fetch(apiUrl(path, opts.query), { method, headers, body, signal: ctrl.signal });
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      throw new ApiError(timedOut ? 'timeout' : 'network', {
        requestId,
        message: timedOut ? undefined : (e as Error)?.message,
      });
    }
    const echoed = res.headers.get('x-request-id') ?? requestId;

    if (opts.responseType === 'blob' && res.ok) {
      return { status: res.status, body: await res.blob(), requestId: echoed };
    }
    const text = res.status === 204 ? '' : await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        if (res.ok) throw new ApiError('parse', { status: res.status, requestId: echoed });
        parsed = { message: text.slice(0, 200) };
      }
    }
    const ra = res.headers.get('retry-after');
    return {
      status: res.status,
      body: parsed,
      requestId: echoed,
      retryAfter: ra != null && ra !== '' ? Number(ra) : null,
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

function httpError(r: RawResult): ApiError {
  const body = r.body && typeof r.body === 'object' ? (r.body as ApiErrorBody) : null;
  return new ApiError('http', {
    status: r.status,
    body,
    requestId: r.requestId,
    retryAfterSeconds: r.retryAfter ?? null,
  });
}

/* ---------- Refresh (single flight) ---------- */

let refreshing: Promise<boolean> | null = null;

/** Rotates the refresh token. Concurrent callers share one request. Resolves false when refused. */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  const r = await send('POST', 'auth/refresh', { body: { refreshToken } }, null, null);
  if (r.status >= 200 && r.status < 300) {
    setTokens(r.body as TokenPair);
    return true;
  }
  if (r.status >= 400 && r.status < 500 && r.status !== 429) {
    const suspended = (r.body as ApiErrorBody | undefined)?.code === 'ACCOUNT_SUSPENDED';
    endSession(suspended ? 'suspended' : 'refresh_failed');
    return false;
  }
  // 429 or 5xx: keep the tokens; the caller treats the API as unavailable for now.
  throw httpError(r);
}

/* ---------- Requests ---------- */

export async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  const auth = opts.auth !== false;
  const idemKey =
    MUTATING.has(method) && opts.idempotencyKey !== false ? opts.idempotencyKey || newIdempotencyKey() : null;

  let token: string | null = null;
  if (auth) {
    token = getAccessToken();
    if (!token) {
      // No valid access token in memory (expired, or a reload): try the refresh token first.
      if (!(await refreshSession())) throw new ApiError('unauthorized', { status: 401 });
      token = getAccessToken();
    }
  }

  let r = await send(method, path, opts, token, idemKey);

  if (auth && r.status === 401) {
    // Another call may have refreshed while this one was in flight: reuse its token.
    const current = peekAccessToken();
    const fresh = current && current !== token ? true : await refreshSession();
    if (!fresh) throw new ApiError('unauthorized', { status: 401, body: r.body as ApiErrorBody });
    // Same Idempotency-Key: the server never applies the retried write twice.
    r = await send(method, path, opts, getAccessToken() ?? peekAccessToken(), idemKey);
    if (r.status === 401) {
      endSession('refresh_failed');
      throw new ApiError('unauthorized', { status: 401, body: r.body as ApiErrorBody, requestId: r.requestId });
    }
  }

  if (auth && r.status === 403 && (r.body as ApiErrorBody | undefined)?.code === 'ACCOUNT_SUSPENDED') {
    endSession('suspended');
  }
  if (r.status < 200 || r.status >= 300) throw httpError(r);
  return r.body as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'body'>) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PATCH', path, { ...opts, body }),
  delete: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('DELETE', path, { ...opts, body }),
  blob: (path: string, opts?: Omit<RequestOptions, 'body' | 'responseType'>) =>
    request<Blob>('GET', path, { ...opts, responseType: 'blob' }),
};

/** For tests: forget an in-flight refresh. */
export function __resetClientForTests(): void {
  refreshing = null;
}
