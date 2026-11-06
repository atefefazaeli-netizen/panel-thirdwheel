// Staff authentication (STAFF_API.md §2): username and password, TOTP for Owners, restricted
// sessions for MFA enrollment and temporary passwords, CSRF tokens, lockout. The session cookie is
// simulated by `db().staff.jar` (see data/staff.ts).
import { http, HttpResponse } from 'msw';
import { OWNER_ONLY_PERMISSIONS } from '@/lib/permissions';
import { accountPermissions, passwordProblems, staffMe, type StaffAccount, type StaffSession } from '../data/staff';
import { db, recordAudit } from '../db';
import { actorOf, currentSession, guard } from '../session';
import { randomSecret, verifyTotp } from '../totp';
import { apiError, badRequest, mockId, nowIso, p, randomToken, readJson } from '../utils';

const LOCK_AFTER = 5;
const LOCK_BASE_MS = 15 * 60_000;
const LOCK_MAX_MS = 24 * 60 * 60_000;
const CHALLENGE_MS = 5 * 60_000;

const invalid = () => apiError(401, 'Invalid username or password.', 'INVALID_CREDENTIALS');

/** Holding an owner-only permission means the Owner role: two-factor is mandatory. */
const needsMfa = (a: StaffAccount) =>
  accountPermissions(a, db().staff.customRoles).some((x) => OWNER_ONLY_PERMISSIONS.includes(x));

function restrictionFor(a: StaffAccount): StaffSession['restricted'] {
  if (needsMfa(a) && !a.mfaSecret) return 'mfa_enrollment';
  if (a.mustChangePassword) return 'password_change';
  return null;
}

function openSession(a: StaffAccount, request: Request): StaffSession {
  const session: StaffSession = {
    id: `sid_${randomToken(32)}`,
    staffId: a.id,
    csrfToken: randomToken(32),
    restricted: restrictionFor(a),
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
    userAgent: request.headers.get('user-agent') ?? 'Browser',
  };
  db().staff.sessions.set(session.id, session);
  db().staff.jar = session.id; // Set-Cookie: tw_staff_sid=…; HttpOnly
  a.lastLoginAt = nowIso();
  return session;
}

function loginAnswer(a: StaffAccount, session: StaffSession) {
  const staff = staffMe(a, db().staff.customRoles);
  const status =
    session.restricted === 'mfa_enrollment'
      ? 'mfa_enrollment_required'
      : session.restricted === 'password_change'
        ? 'password_change_required'
        : 'ok';
  return HttpResponse.json({ status, staff, csrfToken: session.csrfToken });
}

function lock(a: StaffAccount) {
  a.lockouts += 1;
  const ms = Math.min(LOCK_MAX_MS, LOCK_BASE_MS * 2 ** (a.lockouts - 1));
  a.lockedUntil = new Date(Date.now() + ms).toISOString();
  a.failures = 0;
}

const lockedAnswer = (a: StaffAccount) =>
  apiError(423, 'Too many failed attempts.', 'ACCOUNT_LOCKED', { retryAt: a.lockedUntil });

/** Revokes every session of an account (optionally keeping one). */
export function revokeSessionsOf(staffId: string, keep?: string): void {
  const s = db().staff;
  for (const [id, sess] of s.sessions) if (sess.staffId === staffId && id !== keep) s.sessions.delete(id);
  if (s.jar && !s.sessions.has(s.jar)) s.jar = null;
}

const newRecoveryCodes = () =>
  Array.from({ length: 10 }, () => `${randomToken(5).toLowerCase()}-${randomToken(5).toLowerCase()}`);

export const authHandlers = [
  http.post(p('staff/auth/login'), async ({ request }) => {
    const { username, password } = await readJson<{ username?: unknown; password?: unknown }>(request);
    if (typeof username !== 'string' || typeof password !== 'string')
      return badRequest('username and password are required');
    const a = db().staff.accounts.find((x) => x.username === username.trim().toLowerCase());
    if (a?.lockedUntil && Date.parse(a.lockedUntil) > Date.now()) return lockedAnswer(a);
    // Unknown usernames and disabled accounts answer exactly like a wrong password.
    if (!a || a.disabled) return invalid();
    if (a.password !== password) {
      a.failures += 1;
      if (a.failures >= LOCK_AFTER) {
        lock(a);
        return lockedAnswer(a);
      }
      return invalid();
    }
    a.failures = 0;
    a.lockedUntil = null;
    if (a.mfaSecret) {
      const challenge = `mfa_${randomToken(32)}`;
      db().staff.challenges.set(challenge, { staffId: a.id, expiresAt: Date.now() + CHALLENGE_MS, wrong: 0 });
      return HttpResponse.json({ status: 'mfa_required', challenge });
    }
    return loginAnswer(a, openSession(a, request));
  }),

  http.post(p('staff/auth/login/mfa'), async ({ request }) => {
    const body = await readJson<{ challenge?: string; code?: string; recoveryCode?: string }>(request);
    const ch = body.challenge ? db().staff.challenges.get(body.challenge) : undefined;
    if (!body.challenge || !ch || ch.expiresAt < Date.now())
      return apiError(401, 'This sign-in expired. Start again.', 'MFA_CHALLENGE_EXPIRED');
    const a = db().staff.accounts.find((x) => x.id === ch.staffId);
    if (!a || a.disabled || !a.mfaSecret) return invalid();
    let ok = false;
    if (typeof body.recoveryCode === 'string') {
      const i = a.recoveryCodes.indexOf(body.recoveryCode.trim().toLowerCase());
      if (i >= 0) {
        a.recoveryCodes.splice(i, 1); // single use
        ok = true;
      }
    } else if (typeof body.code === 'string') {
      const step = await verifyTotp(a.mfaSecret, body.code, Date.now(), a.lastStep);
      if (step !== null) {
        a.lastStep = step;
        ok = true;
      }
    }
    if (!ok) {
      ch.wrong += 1;
      if (ch.wrong >= 5) db().staff.challenges.delete(body.challenge);
      return apiError(401, 'That code is not right.', 'MFA_INVALID');
    }
    db().staff.challenges.delete(body.challenge);
    return loginAnswer(a, openSession(a, request));
  }),

  http.get(p('staff/auth/session'), () => {
    const hit = currentSession();
    if (!hit) return apiError(401, 'No staff session.', 'STAFF_SESSION_REQUIRED');
    return HttpResponse.json({
      staff: staffMe(hit.account, db().staff.customRoles),
      csrfToken: hit.session.csrfToken,
      restricted: hit.session.restricted,
    });
  }),

  http.post(p('staff/auth/logout'), () => {
    const s = db().staff;
    if (s.jar) s.sessions.delete(s.jar);
    s.jar = null; // the cookie is cleared
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(p('staff/auth/password'), ({ request }) =>
    guard(
      request,
      'session',
      async (me) => {
        const { currentPassword, newPassword } = await readJson<{ currentPassword?: string; newPassword?: string }>(
          request,
        );
        if (currentPassword !== me.account.password)
          return apiError(401, 'The current password is not right.', 'INVALID_CREDENTIALS');
        const problems = passwordProblems(newPassword, me.account.username);
        if (problems.length)
          return apiError(400, 'Choose a stronger password.', 'WEAK_PASSWORD', { details: problems });
        me.account.password = newPassword as string;
        me.account.mustChangePassword = false;
        revokeSessionsOf(me.account.id, me.session.id);
        if (me.session.restricted === 'password_change') me.session.restricted = restrictionFor(me.account);
        recordAudit(me, 'staff.password_change', `staff:${me.account.id}`);
        return new HttpResponse(null, { status: 204 });
      },
      { restricted: true },
    ),
  ),

  http.post(p('staff/auth/mfa/setup'), ({ request }) =>
    guard(
      request,
      'session',
      async (me) => {
        const { password } = await readJson<{ password?: string }>(request);
        if (password !== me.account.password) return apiError(401, 'The password is not right.', 'INVALID_CREDENTIALS');
        const secret = randomSecret();
        me.account.pendingSecret = secret;
        const label = encodeURIComponent(`Thirdwheel panel:${me.account.username}`);
        return HttpResponse.json({
          secret,
          otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=Thirdwheel%20panel&algorithm=SHA1&digits=6&period=30`,
        });
      },
      { restricted: true },
    ),
  ),

  http.post(p('staff/auth/mfa/enable'), ({ request }) =>
    guard(
      request,
      'session',
      async (me) => {
        const { code } = await readJson<{ code?: string }>(request);
        const secret = me.account.pendingSecret;
        if (!secret) return apiError(409, 'Start the setup first.', 'MFA_SETUP_REQUIRED');
        const step = await verifyTotp(secret, String(code ?? ''), Date.now(), -1);
        if (step === null) return apiError(401, 'That code is not right.', 'MFA_INVALID');
        me.account.mfaSecret = secret;
        me.account.pendingSecret = null;
        me.account.lastStep = step;
        me.account.recoveryCodes = newRecoveryCodes();
        if (me.session.restricted === 'mfa_enrollment') me.session.restricted = restrictionFor(me.account);
        recordAudit(me, 'staff.mfa_enable', `staff:${me.account.id}`);
        return HttpResponse.json({ recoveryCodes: [...me.account.recoveryCodes] });
      },
      { restricted: true },
    ),
  ),

  http.post(p('staff/auth/mfa/recovery-codes'), ({ request }) =>
    guard(request, 'session', async (me) => {
      const { code } = await readJson<{ code?: string }>(request);
      if (!me.account.mfaSecret) return apiError(409, 'Two-factor sign-in is off.', 'MFA_NOT_ENABLED');
      const step = await verifyTotp(me.account.mfaSecret, String(code ?? ''), Date.now(), me.account.lastStep);
      if (step === null) return apiError(401, 'That code is not right.', 'MFA_INVALID');
      me.account.lastStep = step;
      me.account.recoveryCodes = newRecoveryCodes();
      recordAudit(me, 'staff.mfa_recovery_codes', `staff:${me.account.id}`);
      return HttpResponse.json({ recoveryCodes: [...me.account.recoveryCodes] });
    }),
  ),

  http.post(p('staff/auth/mfa/disable'), ({ request }) =>
    guard(request, 'session', async (me) => {
      const { password, code } = await readJson<{ password?: string; code?: string }>(request);
      if (needsMfa(me.account))
        return apiError(409, 'Owners must keep two-factor sign-in on.', 'MFA_REQUIRED_FOR_ROLE');
      if (password !== me.account.password) return apiError(401, 'The password is not right.', 'INVALID_CREDENTIALS');
      if (!me.account.mfaSecret) return new HttpResponse(null, { status: 204 });
      const step = await verifyTotp(me.account.mfaSecret, String(code ?? ''), Date.now(), me.account.lastStep);
      if (step === null) return apiError(401, 'That code is not right.', 'MFA_INVALID');
      me.account.mfaSecret = null;
      me.account.recoveryCodes = [];
      recordAudit(me, 'staff.mfa_disable', `staff:${me.account.id}`);
      return new HttpResponse(null, { status: 204 });
    }),
  ),

  http.get(p('staff/auth/sessions'), ({ request }) =>
    guard(request, 'session', (me) =>
      HttpResponse.json(
        [...db().staff.sessions.values()]
          .filter((x) => x.staffId === me.account.id)
          .map((x) => ({
            id: x.id.slice(0, 12),
            current: x.id === me.session.id,
            createdAt: x.createdAt,
            lastSeenAt: x.lastSeenAt,
            userAgent: x.userAgent,
          })),
      ),
    ),
  ),

  http.delete(p('staff/auth/sessions/:id'), ({ request, params }) =>
    guard(request, 'session', (me) => {
      const s = db().staff;
      const hit = [...s.sessions.values()].find((x) => x.id.slice(0, 12) === params.id && x.staffId === me.account.id);
      if (!hit) return apiError(404, 'No such session.', 'SESSION_NOT_FOUND');
      s.sessions.delete(hit.id);
      if (s.jar === hit.id) s.jar = null;
      recordAudit(me, 'staff.session_revoke', `staff:${me.account.id}`);
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];

/** For tests and the dev UI: open a session for an account directly (no password). */
export function openSessionFor(a: StaffAccount, restricted: StaffSession['restricted'] = null) {
  const session: StaffSession = {
    id: `sid_${randomToken(32)}`,
    staffId: a.id,
    csrfToken: randomToken(32),
    restricted,
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
    userAgent: 'Test browser',
  };
  db().staff.sessions.set(session.id, session);
  db().staff.jar = session.id;
  return { session, me: actorOf(a, session), id: mockId('s') };
}
