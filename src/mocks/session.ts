// Bearer-token checks for the mock handlers, mirroring the API's guards: 401 without a valid
// access token, 403 when the role does not allow the route.
import type { StaffUser } from '@/stores/session';
import { db } from './db';
import { apiError } from './utils';

export type Need = 'staff' | 'admin' | 'clinician' | 'user';

export function currentUser(request: Request): StaffUser | null {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const hit = db().auth.access.get(token);
  if (!hit || hit.exp < Date.now()) return null;
  return hit.user;
}

/** Runs `fn` with the signed-in staff member when the role allows it, else answers 401 / 403. */
export async function guard(
  request: Request,
  need: Need,
  fn: (me: StaffUser) => Response | Promise<Response>,
): Promise<Response> {
  const me = currentUser(request);
  if (!me) return apiError(401, 'Unauthorized', 'UNAUTHORIZED');
  const isStaff = me.roles.includes('admin') || me.roles.includes('clinician');
  const ok = need === 'user' || (need === 'staff' ? isStaff : me.roles.includes(need));
  if (!ok) return apiError(403, 'Insufficient role', 'INSUFFICIENT_ROLE');
  return fn(me);
}
