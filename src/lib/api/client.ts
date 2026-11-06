// Typed fetch wrapper for the Thirdwheel API (STAFF_API.md §1, §2).
// - Base URL from VITE_API_URL (default `/api/v1`, proxied by the Vite dev server).
// - The staff session is an HttpOnly cookie (`tw_staff_sid`): every call sends
//   `credentials: 'include'` and the panel never sees or stores a token.
// - Writes (POST, PUT, PATCH, DELETE) send `X-CSRF-Token` (kept in memory, csrf.ts) and an
//   `Idempotency-Key`, so a retried request is never applied twice.
// - A 401 runs one session re-check for all callers (single flight). No session left: the session
//   ends and the app goes to sign-in. A 403 CSRF_FAILED re-reads the session (new token) and retries
//   once. A 403 for a missing permission tells listeners, so the session's permissions are re-read.
// - Failures throw ApiError with the server's `code`, `requestId`, `retryAt` and `details`.
import { env } from '@/config/env';
import type { Restriction, StaffMe } from '@/stores/session';
import { clearCsrfToken, getCsrfToken, setCsrfToken } from './csrf';
import { ApiError, isPermissionRefusalCode, type ApiErrorBody } from './errors';
import type { Query } from './types';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /**
   * The call needs a staff session (default true): a 401 then re-checks the session and ends it
   * when none is left. Sign-in routes pass false (a 401 there is a wrong password).
   */
  auth?: boolean;
  /** Override the generated Idempotency-Key, or `false` to send none. */
  idempotencyKey?: string | false;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** `blob` for files (support screenshots). */
  responseType?: 'json' | 'blob';
  timeoutMs?: number;
}

/** `GET staff/auth/session` (STAFF_API.md §2). */
export interface SessionInfo {
  staff: StaffMe;
  csrfToken: string;
  restricted: Restriction | null;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const MUTATING: ReadonlySet<Method> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const SESSION_PATH = 'staff/auth/session';

export type SessionEndReason = 'expired' | 'signed_out';
const sessionEndListeners = new Set<(reason: SessionEndReason) => void>();
const sessionListeners = new Set<(info: SessionInfo) => void>();
const permissionRefusedListeners = new Set<() => void>();

function notify<A extends unknown[]>(set: Set<(...a: A) => void>, ...args: A): void {
  set.forEach((fn) => {
    try {
      fn(...args);
    } catch {
      // A listener must not stop the others.
    }
  });
}

/** Called with every session the API answers (sign-in, reload, re-check). */
export function onSession(fn: (info: SessionInfo) => void): () => void {
  sessionListeners.add(fn);
  return () => void sessionListeners.delete(fn);
}

/** Called when the API refuses a call for a missing permission (or a restricted session). */
export function onPermissionRefused(fn: () => void): () => void {
  permissionRefusedListeners.add(fn);
  return () => void permissionRefusedListeners.delete(fn);
}

/** Called when the session ends (expired, revoked, signed out). */
export function onSessionEnd(fn: (reason: SessionEndReason) => void): () => void {
  sessionEndListeners.add(fn);
  return () => void sessionEndListeners.delete(fn);
}

export function endSession(reason: SessionEndReason): void {
  clearCsrfToken();
  notify(sessionEndListeners, reason);
}

/** Records a session answer: keeps the CSRF token in memory and tells listeners. */
export function acceptSession(info: SessionInfo): SessionInfo {
  setCsrfToken(info.csrfToken);
  notify(sessionListeners, info);
  return info;
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

async function send(method: Method, path: string, opts: RequestOptions, idemKey: string | null): Promise<RawResult> {
  const requestId = newRequestId();
  const headers: Record<string, string> = { Accept: 'application/json', 'x-request-id': requestId, ...opts.headers };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (MUTATING.has(method)) {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
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
      res = await fetch(apiUrl(path, opts.query), {
        method,
        headers,
        body,
        signal: ctrl.signal,
        // The staff session cookie (HttpOnly, set by the API) goes with every call.
        credentials: 'include',
      });
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

const codeOf = (r: RawResult) => (r.body as ApiErrorBody | undefined)?.code;

/* ---------- Session re-check (single flight) ---------- */

let checking: Promise<SessionInfo | null> | null = null;

/**
 * Re-reads the session (`GET staff/auth/session`). Concurrent callers share one request. Resolves
 * the session, or null when there is none (the session then ends). A busy or unreachable API
 * throws and keeps the session as it is.
 */
export function recheckSession(): Promise<SessionInfo | null> {
  checking ??= doRecheck().finally(() => {
    checking = null;
  });
  return checking;
}

async function doRecheck(): Promise<SessionInfo | null> {
  const r = await send('GET', SESSION_PATH, {}, null);
  if (r.status >= 200 && r.status < 300) return acceptSession(r.body as SessionInfo);
  if (r.status === 401) {
    endSession('expired');
    return null;
  }
  throw httpError(r);
}

/* ---------- Requests ---------- */

export async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  const auth = opts.auth !== false;
  const idemKey =
    MUTATING.has(method) && opts.idempotencyKey !== false ? opts.idempotencyKey || newIdempotencyKey() : null;

  let r = await send(method, path, opts, idemKey);

  if (auth && r.status === 401) {
    // The cookie expired or was revoked, or another tab signed out: ask the API once for all callers.
    const info = await recheckSession().catch(() => null);
    if (!info)
      throw new ApiError('unauthorized', { status: 401, body: r.body as ApiErrorBody, requestId: r.requestId });
    // Same Idempotency-Key: the server never applies the retried write twice.
    r = await send(method, path, opts, idemKey);
    if (r.status === 401) {
      endSession('expired');
      throw new ApiError('unauthorized', { status: 401, body: r.body as ApiErrorBody, requestId: r.requestId });
    }
  }

  if (auth && r.status === 403 && codeOf(r) === 'CSRF_FAILED' && MUTATING.has(method)) {
    // The token in memory is stale (a new session, or one rotated by a password change): fetch the
    // session again for a fresh token and retry once.
    const info = await recheckSession().catch(() => null);
    if (info) r = await send(method, path, opts, idemKey);
  }

  if (auth && r.status === 403 && isPermissionRefusalCode(codeOf(r))) notify(permissionRefusedListeners);
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

/** For tests: forget an in-flight session re-check and the CSRF token. */
export function __resetClientForTests(): void {
  checking = null;
  clearCsrfToken();
}
