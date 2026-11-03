// Typed API errors. The server's error body is `{ statusCode, message, code?, requestId, retryAt? }`
// (backend/docs/ADMIN_API.md); validation errors may also carry `details`.

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'parse' | 'unauthorized';

export interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
  code?: string;
  requestId?: string;
  retryAt?: string | number;
  details?: unknown;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly requestId: string | null;
  readonly retryAt: string | number | null;
  readonly details: unknown;

  constructor(
    kind: ApiErrorKind,
    init: { status?: number | null; body?: ApiErrorBody | null; message?: string; requestId?: string | null } = {},
  ) {
    const body = init.body ?? null;
    const fromBody = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    super(fromBody || init.message || defaultMessage(kind, init.status ?? null));
    this.name = 'ApiError';
    this.kind = kind;
    this.status = init.status ?? body?.statusCode ?? null;
    this.code = body?.code ?? null;
    this.requestId = body?.requestId ?? init.requestId ?? null;
    this.retryAt = body?.retryAt ?? null;
    this.details = body?.details ?? null;
  }

  /** 4xx: the request itself is wrong, retrying will not help. */
  get isClientError(): boolean {
    return this.status != null && this.status >= 400 && this.status < 500;
  }

  /** Network failure, timeout or 5xx: worth retrying a read. */
  get isTransient(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || (this.status != null && this.status >= 500);
  }
}

function defaultMessage(kind: ApiErrorKind, status: number | null): string {
  switch (kind) {
    case 'network':
      return 'Could not reach the server. Check your connection.';
    case 'timeout':
      return 'The server took too long to answer.';
    case 'parse':
      return 'The server sent a response the panel could not read.';
    case 'unauthorized':
      return 'Your session ended. Sign in again.';
    default:
      return status ? `Request failed (${status}).` : 'Request failed.';
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** Friendly copy for known error codes; falls back to the server message. */
const CODE_COPY: Record<string, string> = {
  ACCOUNT_SUSPENDED: 'This account is suspended.',
  CONFIRM_MISMATCH: 'The email you typed does not match this account.',
  STAFF_ACCOUNT: 'Staff accounts cannot be deleted here.',
  SELF_ACTION: 'You cannot do this to your own account.',
  CONTENT_EXISTS: 'An item with this id already exists.',
  NOT_IN_REVIEW: 'This item is not in review any more.',
  INVALID_CONTENT: 'The content did not pass validation.',
  PROVIDER_NOT_CONFIGURED: 'That provider has no API key on the server.',
  FORBIDDEN: 'Your role cannot do this.',
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return (e.code && CODE_COPY[e.code]) || e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

/** TanStack Query retry policy: retry reads on network errors and 5xx, never on 4xx. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError) return error.isTransient;
  return false;
}
