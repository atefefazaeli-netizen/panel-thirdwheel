// ADMIN_API.md › Users & couples (admin only).
import { http, HttpResponse } from 'msw';
import type { AdminUserDetail, AdminUserRow } from '@/features/users/api/types';
import type { StaffUser } from '@/stores/session';
import type { MockUser } from '../data/users';
import { db, recordAudit } from '../db';
import { emitMockEvent } from '../events';
import { guard } from '../session';
import { apiError, badRequest, nowIso, p, paginate, readJson } from '../utils';

const TAG_RE = /^[a-z0-9-]{1,32}$/;

const row = (u: MockUser): AdminUserRow => {
  const partner = u.couple ? db().users.get(u.couple.partnerId) : null;
  return {
    userId: u.account.userId,
    email: u.account.email,
    name: u.name,
    createdAt: u.account.createdAt,
    plan: u.subscription.state,
    plus: u.subscription.plus,
    linked: !!u.couple,
    partner: partner ? { userId: partner.account.userId, name: partner.name } : null,
    suspended: u.account.suspended,
    tags: u.account.tags,
  };
};

/** Per-user safety and support counts (the owners answer these over the bus in the API). */
function summaries(userId: string): Pick<AdminUserDetail, 'safety' | 'support'> {
  const d = db() as unknown as {
    safety?: { flags: { userId: string; status: string; lastAt: string }[] };
    support?: { tickets: { userId: string; status: string }[] };
  };
  const flags = d.safety?.flags.filter((f) => f.userId === userId) ?? [];
  const tickets = d.support?.tickets.filter((t) => t.userId === userId) ?? [];
  return {
    safety: {
      open: flags.filter((f) => f.status === 'open').length,
      total: flags.length,
      lastAt:
        flags
          .map((f) => f.lastAt)
          .sort()
          .at(-1) ?? null,
    },
    support: { total: tickets.length, open: tickets.filter((t) => t.status === 'open').length },
  };
}

const detail = (u: MockUser): AdminUserDetail => {
  const partner = u.couple ? db().users.get(u.couple.partnerId) : null;
  return {
    account: u.account,
    profile: u.profile,
    couple:
      u.couple && partner
        ? {
            coupleId: u.couple.coupleId,
            linkedAt: u.couple.linkedAt,
            partner: { userId: partner.account.userId, name: partner.name, email: partner.account.email },
          }
        : null,
    subscription: u.subscription,
    ...summaries(u.account.userId),
  };
};

/** Runs an admin action on one account: 404 when missing, 409 SELF_ACTION when `self` is not allowed. */
function onUser(
  request: Request,
  id: unknown,
  opts: { noSelf?: boolean },
  fn: (u: MockUser, me: StaffUser) => Response | Promise<Response>,
) {
  return guard(request, 'admin', (me) => {
    const u = db().users.get(String(id));
    if (!u) return apiError(404, 'User not found', 'USER_NOT_FOUND');
    if (opts.noSelf && u.account.userId === me.userId)
      return apiError(409, 'You cannot do this to your own account.', 'SELF_ACTION');
    return fn(u, me);
  });
}

function revokeSessions(u: MockUser) {
  u.tokenVersion += 1;
  const auth = db().auth;
  for (const [t, v] of auth.access) if (v.user.userId === u.account.userId) auth.access.delete(t);
  for (const [t, v] of auth.refresh) if (v.userId === u.account.userId) auth.refresh.delete(t);
}

/** "One plan covers both partners": a Plus grant or store plan carries to the partner. */
function syncPlus(u: MockUser) {
  const now = Date.now();
  const grant = u.subscription.grant && Date.parse(u.subscription.grant.until) > now ? u.subscription.grant : null;
  const store =
    u.subscription.renewsAt &&
    Date.parse(u.subscription.renewsAt) > now &&
    u.subscription.state !== 'cancelled' &&
    u.subscription.state !== 'paid_by_partner';
  const plus = !!grant || !!store || u.subscription.state === 'payment_problem';
  const state = plus
    ? u.subscription.state === 'free' ||
      u.subscription.state === 'cancelled' ||
      u.subscription.state === 'paid_by_partner'
      ? 'plus'
      : u.subscription.state
    : u.subscription.state === 'plus'
      ? 'free'
      : u.subscription.state;
  u.subscription = { ...u.subscription, grant, plus, state };
  emitMockEvent('user.subscription.changed', { userId: u.account.userId, state, plus, at: nowIso() });
  const partner = u.couple ? db().users.get(u.couple.partnerId) : null;
  if (
    partner &&
    !partner.subscription.grant &&
    !(partner.subscription.renewsAt && partner.subscription.state === 'plus')
  ) {
    partner.subscription = {
      ...partner.subscription,
      plus,
      state: plus ? 'paid_by_partner' : 'free',
      renewsAt: plus ? (u.subscription.grant?.until ?? u.subscription.renewsAt) : null,
    };
    emitMockEvent('user.subscription.changed', {
      userId: partner.account.userId,
      state: partner.subscription.state,
      plus,
      at: nowIso(),
    });
  }
}

function unlinkCouple(u: MockUser): boolean {
  if (!u.couple) return false;
  const partner = db().users.get(u.couple.partnerId);
  u.couple = null;
  if (partner) {
    partner.couple = null;
    if (partner.subscription.state === 'paid_by_partner')
      partner.subscription = { ...partner.subscription, state: 'free', plus: false, renewsAt: null };
  }
  if (u.subscription.state === 'paid_by_partner')
    u.subscription = { ...u.subscription, state: 'free', plus: false, renewsAt: null };
  return true;
}

export const usersHandlers = [
  http.get(p('admin/users'), ({ request }) =>
    guard(request, 'admin', () => {
      const url = new URL(request.url);
      const q = url.searchParams;
      const term = (q.get('q') ?? '').trim().toLowerCase();
      const from = q.get('from');
      const to = q.get('to');
      const bool = (k: string) => (q.get(k) === 'true' ? true : q.get(k) === 'false' ? false : null);
      const rows = [...db().users.values()]
        .filter((u) => {
          if (
            term &&
            !((u.account.email ?? '').toLowerCase().includes(term) || (u.name ?? '').toLowerCase().includes(term))
          )
            return false;
          if (q.get('plan') && u.subscription.state !== q.get('plan')) return false;
          if (bool('linked') !== null && !!u.couple !== bool('linked')) return false;
          if (bool('suspended') !== null && u.account.suspended !== bool('suspended')) return false;
          if (q.get('tag') && !u.account.tags.includes(q.get('tag')!)) return false;
          if (from && u.account.createdAt.slice(0, 10) < from) return false;
          if (to && u.account.createdAt.slice(0, 10) > to) return false;
          return true;
        })
        .sort((a, b) => b.account.createdAt.localeCompare(a.account.createdAt))
        .map(row);
      return HttpResponse.json(paginate(rows, url));
    }),
  ),

  http.get(p('admin/users/:id'), ({ request, params }) =>
    onUser(request, params.id, {}, (u) => HttpResponse.json(detail(u))),
  ),

  http.post(p('admin/users/:id/sign-out'), ({ request, params }) =>
    onUser(request, params.id, {}, (u, me) => {
      revokeSessions(u);
      recordAudit(me, 'user.sign_out', `user:${u.account.userId}`);
      return HttpResponse.json({ ok: true });
    }),
  ),

  http.post(p('admin/users/:id/suspend'), ({ request, params }) =>
    onUser(request, params.id, { noSelf: true }, async (u, me) => {
      const { reason } = await readJson<{ reason?: string }>(request);
      if (typeof reason !== 'string' || !reason.trim() || reason.length > 300)
        return badRequest('reason must be 1 to 300 characters');
      u.account = { ...u.account, suspended: true, suspendedReason: reason.trim() };
      revokeSessions(u);
      recordAudit(me, 'user.suspend', `user:${u.account.userId}`, { reason: reason.trim() });
      return HttpResponse.json(u.account);
    }),
  ),

  http.post(p('admin/users/:id/unsuspend'), ({ request, params }) =>
    onUser(request, params.id, {}, (u, me) => {
      u.account = { ...u.account, suspended: false, suspendedReason: null };
      recordAudit(me, 'user.unsuspend', `user:${u.account.userId}`);
      return HttpResponse.json(u.account);
    }),
  ),

  http.put(p('admin/users/:id/tags'), ({ request, params }) =>
    onUser(request, params.id, {}, async (u, me) => {
      const { tags } = await readJson<{ tags?: unknown }>(request);
      if (!Array.isArray(tags) || tags.length > 20 || tags.some((t) => typeof t !== 'string' || !TAG_RE.test(t))) {
        return badRequest('tags: at most 20, each 1 to 32 of a-z, 0-9 and -');
      }
      u.account = { ...u.account, tags: [...new Set(tags as string[])] };
      recordAudit(me, 'user.tags', `user:${u.account.userId}`, { tags: u.account.tags });
      return HttpResponse.json(u.account);
    }),
  ),

  http.post(p('admin/users/:id/plus'), ({ request, params }) =>
    onUser(request, params.id, {}, async (u, me) => {
      const { days, note } = await readJson<{ days?: unknown; note?: unknown }>(request);
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 365)
        return badRequest('days must be a whole number from 1 to 365');
      if (note !== undefined && (typeof note !== 'string' || note.length > 200))
        return badRequest('note: at most 200 characters');
      u.subscription = {
        ...u.subscription,
        grant: {
          until: new Date(Date.now() + days * 86_400_000).toISOString(),
          by: me.userId,
          note: (note as string | undefined)?.trim() || null,
        },
      };
      syncPlus(u);
      recordAudit(me, 'user.plus_grant', `user:${u.account.userId}`, { days });
      return HttpResponse.json(u.subscription);
    }),
  ),

  http.delete(p('admin/users/:id/plus'), ({ request, params }) =>
    onUser(request, params.id, {}, (u, me) => {
      u.subscription = { ...u.subscription, grant: null };
      syncPlus(u);
      recordAudit(me, 'user.plus_end', `user:${u.account.userId}`);
      return HttpResponse.json(u.subscription);
    }),
  ),

  http.post(p('admin/users/:id/unlink'), ({ request, params }) =>
    onUser(request, params.id, {}, (u, me) => {
      const unlinked = unlinkCouple(u);
      if (unlinked) recordAudit(me, 'user.unlink', `user:${u.account.userId}`);
      return HttpResponse.json({ unlinked });
    }),
  ),

  http.delete(p('admin/users/:id'), ({ request, params }) =>
    onUser(request, params.id, { noSelf: true }, async (u, me) => {
      const { confirmEmail } = await readJson<{ confirmEmail?: string }>(request);
      if (u.account.roles.includes('admin') || u.account.roles.includes('clinician'))
        return apiError(409, 'Staff accounts cannot be deleted here.', 'STAFF_ACCOUNT');
      if (!confirmEmail || confirmEmail.trim().toLowerCase() !== (u.account.email ?? '').toLowerCase())
        return apiError(400, 'The email does not match this account.', 'CONFIRM_MISMATCH');
      unlinkCouple(u);
      revokeSessions(u);
      db().users.delete(u.account.userId);
      recordAudit(me, 'user.delete', `user:${u.account.userId}`);
      return HttpResponse.json({ deleted: true });
    }),
  ),
];
