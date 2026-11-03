// auth.controller.ts routes the panel uses: login/start → verify (mode login), resend, refresh,
// logout. Plus GET admin/me (ADMIN_API.md › Dashboard).
import { http, HttpResponse } from 'msw';
import type { StaffUser } from '@/stores/session';
import { ACCESS_TTL_S, MOCK_CODE, rolesFor } from '../data/auth';
import { db } from '../db';
import { guard } from '../session';
import { apiError, badRequest, mockId, p, randomToken, readJson } from '../utils';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function staffFor(email: string): StaffUser {
  const key = email.toLowerCase();
  const known = db().auth.staff.get(key);
  if (known) return known;
  const user = { userId: mockId('stf_'), email: key, roles: rolesFor(key) };
  db().auth.staff.set(key, user);
  return user;
}

function issueTokens(user: StaffUser) {
  const token = `mock_at_${randomToken(32)}`;
  const refreshToken = `mock_rt_${randomToken(40)}`;
  db().auth.access.set(token, { user, exp: Date.now() + ACCESS_TTL_S * 1000 });
  db().auth.refresh.set(refreshToken, user);
  return { token, refreshToken, expiresIn: ACCESS_TTL_S };
}

export const authHandlers = [
  http.post(p('auth/login/start'), async ({ request }) => {
    const { email } = await readJson<{ email?: string }>(request);
    if (!email || !EMAIL_RE.test(email)) return badRequest('Send a valid email or phone');
    if (email.toLowerCase().startsWith('nobody@')) return HttpResponse.json({ ok: false, reason: 'not_found' });
    const session = `otp_${randomToken(20)}`;
    db().auth.otps.set(session, { email: email.toLowerCase(), attempts: 0, locked: false });
    return HttpResponse.json({ ok: true, session, resendAt: Date.now() + 30_000 });
  }),

  http.post(p('auth/resend'), async ({ request }) => {
    const { session } = await readJson<{ session?: string }>(request);
    const otp = session ? db().auth.otps.get(session) : undefined;
    if (otp) {
      otp.attempts = 0;
      otp.locked = false;
    }
    return HttpResponse.json({ resendAt: Date.now() + 30_000 });
  }),

  http.post(p('auth/verify'), async ({ request }) => {
    const { session, code } = await readJson<{ session?: string; code?: string }>(request);
    const otp = session ? db().auth.otps.get(session) : undefined;
    if (!session || !otp)
      return HttpResponse.json({ ok: false, attempts: 0, locked: false, code: 'SESSION_NOT_FOUND' });
    if (otp.locked) return HttpResponse.json({ ok: false, attempts: otp.attempts, locked: true, code: 'CODE_LOCKED' });
    if (code !== MOCK_CODE) {
      otp.attempts += 1;
      otp.locked = otp.attempts >= 3;
      return HttpResponse.json({
        ok: false,
        attempts: otp.attempts,
        locked: otp.locked,
        code: otp.locked ? 'CODE_LOCKED' : 'CODE_INCORRECT',
      });
    }
    db().auth.otps.delete(session);
    const user = staffFor(otp.email);
    return HttpResponse.json({ ok: true, mode: 'login', userId: user.userId, ...issueTokens(user) });
  }),

  http.post(p('auth/refresh'), async ({ request }) => {
    const { refreshToken } = await readJson<{ refreshToken?: string }>(request);
    const user = refreshToken ? db().auth.refresh.get(refreshToken) : undefined;
    if (!refreshToken || !user) return apiError(401, 'Refresh token is invalid or expired', 'REFRESH_INVALID');
    // Rotation: the old refresh token stops working.
    db().auth.refresh.delete(refreshToken);
    return HttpResponse.json(issueTokens(user));
  }),

  http.post(p('auth/logout'), async ({ request }) => {
    const { refreshToken } = await readJson<{ refreshToken?: string }>(request);
    if (refreshToken) db().auth.refresh.delete(refreshToken);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(p('admin/me'), ({ request }) =>
    guard(request, 'staff', (me) => HttpResponse.json({ userId: me.userId, email: me.email, roles: me.roles })),
  ),
];
