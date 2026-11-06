// Typed API errors. The server's error body is `{ statusCode, message, code?, requestId, retryAt? }`
// (backend/docs/ADMIN_API.md, STAFF_API.md); validation errors may also carry `details`.

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
    init: {
      status?: number | null;
      body?: ApiErrorBody | null;
      message?: string;
      requestId?: string | null;
      /** `Retry-After` in seconds, used when the body has no `retryAt`. */
      retryAfterSeconds?: number | null;
    } = {},
  ) {
    const body = init.body ?? null;
    const fromBody = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    super(fromBody || init.message || defaultMessage(kind, init.status ?? null));
    this.name = 'ApiError';
    this.kind = kind;
    this.status = init.status ?? body?.statusCode ?? null;
    this.code = body?.code ?? null;
    this.requestId = body?.requestId ?? init.requestId ?? null;
    this.retryAt =
      body?.retryAt ??
      (init.retryAfterSeconds != null && Number.isFinite(init.retryAfterSeconds)
        ? Date.now() + init.retryAfterSeconds * 1000
        : null);
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
  // Staff sign-in and accounts (STAFF_API.md §2, §3).
  INVALID_CREDENTIALS: 'The username or password is not right.',
  MFA_INVALID: 'That code is not right. Check the time on your phone and try again.',
  MFA_CHALLENGE_EXPIRED: 'This sign-in timed out. Enter your username and password again.',
  MFA_REQUIRED_FOR_ROLE: 'Owners must keep two-factor sign-in on.',
  WEAK_PASSWORD: 'Choose a stronger password.',
  STAFF_SESSION_REQUIRED: 'Your session ended. Sign in again.',
  CSRF_FAILED: 'The panel could not confirm this request came from it. Reload the page and try again.',
  INSUFFICIENT_PERMISSION: 'Not available for your role.',
  SESSION_RESTRICTED: 'Finish setting up your account first.',
  USERNAME_TAKEN: 'That username is taken.',
  SELF_ROLE_CHANGE: 'You cannot change your own roles. Ask another Owner.',
  LAST_OWNER: 'This would leave no active Owner. Make someone else an Owner first.',
  STAFF_NOT_FOUND: 'This staff account no longer exists.',
  INVALID_PERMISSIONS: 'Some of these permissions cannot be used in a custom role.',
  BUILTIN_ROLE: 'Built-in roles cannot be changed or deleted.',
  ROLE_IN_USE: 'Someone still holds this role. Remove it from every account first.',
  ROLE_EXISTS: 'A role with this key exists already.',
  ROLE_NOT_FOUND: 'This role no longer exists.',
  // Support workflow (§5) and Remote Config (§6), as built on feature/support-remote-config.
  TICKET_CONFLICT:
    'Someone else changed this ticket since you opened it. The latest is loaded; check it and try again.',
  TICKET_TIMELINE_FULL: 'This ticket has too much history. Close it and continue on a new ticket.',
  ASSIGNEE_NOT_ELIGIBLE: 'That person cannot be assigned: only active staff who can read support tickets can.',
  REPLY_NOT_FOUND: 'This reply no longer exists.',
  REPLY_ALREADY_SENT: 'This reply was already sent.',
  CONFIG_CONFLICT:
    'Someone else changed Remote Config since you opened it. Load the latest, then make your change again.',
  INVALID_CONFIG: 'The config did not pass the server checks.',
  CONFIG_UNCHANGED: 'This is already what the app gets: nothing changes.',
  CONFIG_VERSION_NOT_FOUND: 'There is no published version with that number.',
  FEATURE_DISABLED: 'This feature is switched off in Remote Config.',
  CONTENT_EXISTS: 'An item with this id already exists.',
  NOT_IN_REVIEW: 'This item is not in review any more.',
  INVALID_CONTENT: 'The content did not pass validation.',
  CONTENT_CONFLICT: 'Someone else changed this item since you opened it.',
  HELD_CONTENT: 'This draft matches content the workbook holds back. Confirm you checked it.',
  NOT_PUBLISHED: 'This item was never approved, so it is not in the app.',
  PROVIDER_NOT_CONFIGURED: 'That provider has no API key on the server.',
  SETTINGS_CONFLICT: 'Someone else saved the AI settings since you opened them. Reload, then make your change again.',
  FORBIDDEN: 'Your role cannot do this.',
  INSUFFICIENT_ROLE: 'Not available for your role.',
  USER_NOT_FOUND: 'This account no longer exists. It may have been deleted.',
  INVALID_REASON: 'Give a reason of 1 to 300 characters.',
  INVALID_TAGS: 'Tags: at most 20, each 1 to 32 characters of a-z, 0-9 and -.',
  INVALID_DAYS: 'Grant 1 to 365 days.',
  INVALID_NOTE: 'The note is too long.',
  TICKET_NOT_FOUND: 'This ticket no longer exists. It may have been deleted with the account.',
  SCREENSHOT_NOT_FOUND: 'This ticket has no screenshot.',
  FLAG_NOT_FOUND: 'This safety flag no longer exists. It may have expired or been deleted with the account.',
  CATALOG_ITEM_EXISTS: 'An idea with this id exists already. Retired ideas keep their id.',
  CATALOG_ITEM_NOT_FOUND: 'This idea no longer exists. It may have been retired.',
  EXPERIENCE_EXISTS: 'An experience with this id exists already. Retired ones keep their id.',
  EXPERIENCE_NOT_FOUND: 'This experience no longer exists. It may have been retired.',
  BOOKING_LINK_NOT_FOUND: 'This card has no venue page to remove.',
  WEBHOOK_URL_INVALID: 'The server refused this webhook URL.',
};

/** "Too many requests" with how long to wait, from `retryAt` (body) or `Retry-After` (header). */
function rateLimitMessage(e: ApiError, now = Date.now()): string {
  const at = typeof e.retryAt === 'number' ? e.retryAt : e.retryAt ? Date.parse(e.retryAt) : NaN;
  const seconds = Number.isFinite(at) ? Math.max(1, Math.ceil((at - now) / 1000)) : null;
  return seconds ? `Too many requests. Try again in ${seconds} s.` : 'Too many requests. Wait a moment and try again.';
}

/** Codes a 403 carries when the session lacks the permission (or is restricted to a setup step). */
const PERMISSION_REFUSALS = new Set([
  'INSUFFICIENT_PERMISSION',
  'INSUFFICIENT_ROLE',
  'FORBIDDEN',
  'SESSION_RESTRICTED',
]);
export const isPermissionRefusalCode = (code: string | null | undefined): boolean =>
  !!code && PERMISSION_REFUSALS.has(code);

/** 403 for a missing permission (not a CSRF failure): show "Not available for your role". */
export function isPermissionRefusal(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403 && isPermissionRefusalCode(e.code);
}

/** "Locked until 14:05" from a 423 ACCOUNT_LOCKED (`retryAt`). */
function lockedMessage(e: ApiError): string {
  const at = typeof e.retryAt === 'number' ? e.retryAt : e.retryAt ? Date.parse(e.retryAt) : NaN;
  if (!Number.isFinite(at)) return 'Too many failed attempts. This account is locked for now; try again later.';
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(at));
  return `Too many failed attempts. This account is locked until ${time}.`;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError && (e.code === 'ACCOUNT_LOCKED' || e.status === 423)) return lockedMessage(e);
  if (e instanceof ApiError && (e.code === 'RATE_LIMITED' || e.status === 429)) return rateLimitMessage(e);
  if (e instanceof ApiError && e.code === 'WEBHOOK_URL_INVALID') return `${CODE_COPY.WEBHOOK_URL_INVALID} ${e.message}`;
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
