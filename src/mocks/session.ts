// Staff session checks for the mock handlers, mirroring the API's guards (STAFF_API.md §1, §2, §4):
// 401 STAFF_SESSION_REQUIRED without a live session, 403 SESSION_RESTRICTED for a restricted
// session outside its setup routes, 403 CSRF_FAILED for a write without the session's
// X-CSRF-Token, 403 INSUFFICIENT_PERMISSION when no role grants the permission (deny by default).
import type { Permission } from '@/lib/permissions';
import { accountPermissions, type StaffAccount, type StaffSession } from './data/staff';
import { db } from './db';
import { apiError } from './utils';

/** The signed-in staff member as handlers see it (actor ids are `staff:<id>`, STAFF_API.md §4). */
export interface MockActor {
  userId: string;
  /** Staff have no email; kept for the older view fields (always null now). */
  email: null;
  name: string;
  staffId: string;
  roles: string[];
  permissions: Permission[];
  account: StaffAccount;
  session: StaffSession;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Idle session lifetime in the mock (STAFF_SESSION_IDLE_MINUTES default). */
const IDLE_MS = 60 * 60_000;

export function currentSession(): { session: StaffSession; account: StaffAccount } | null {
  const s = db().staff;
  const sid = s.jar;
  const session = sid ? s.sessions.get(sid) : undefined;
  if (!session) return null;
  if (Date.now() - Date.parse(session.lastSeenAt) > IDLE_MS) {
    s.sessions.delete(session.id);
    return null;
  }
  const account = s.accounts.find((a) => a.id === session.staffId);
  if (!account || account.disabled) return null;
  session.lastSeenAt = new Date().toISOString();
  return { session, account };
}

export function actorOf(account: StaffAccount, session: StaffSession): MockActor {
  return {
    userId: `staff:${account.id}`,
    email: null,
    name: account.displayName,
    staffId: account.id,
    roles: account.roles,
    permissions: accountPermissions(account, db().staff.customRoles),
    account,
    session,
  };
}

function csrfOk(request: Request, session: StaffSession): boolean {
  return request.headers.get('x-csrf-token') === session.csrfToken;
}

/**
 * Runs `fn` for a signed-in staff member holding the permission (any of a list). `'session'` only
 * needs an unrestricted session; `{ restricted: true }` also lets a restricted session through
 * (the setup routes).
 */
export async function guard(
  request: Request,
  need: Permission | Permission[] | 'session',
  fn: (me: MockActor) => Response | Promise<Response>,
  opts: { restricted?: boolean } = {},
): Promise<Response> {
  const hit = currentSession();
  if (!hit) return apiError(401, 'Sign in to the panel.', 'STAFF_SESSION_REQUIRED');
  const { session, account } = hit;
  if (MUTATING.has(request.method) && !csrfOk(request, session))
    return apiError(403, 'CSRF check failed.', 'CSRF_FAILED');
  if (session.restricted && !opts.restricted)
    return apiError(403, 'Finish setting up your account first.', 'SESSION_RESTRICTED');
  const me = actorOf(account, session);
  if (need !== 'session') {
    const list = Array.isArray(need) ? need : [need];
    if (!list.some((p) => me.permissions.includes(p)))
      return apiError(403, 'Your roles do not allow this.', 'INSUFFICIENT_PERMISSION');
  }
  return fn(me);
}

/** Holds the permission (for parts of an answer that need an extra one, like a user's safety data). */
export const holds = (me: MockActor, p: Permission) => me.permissions.includes(p);
