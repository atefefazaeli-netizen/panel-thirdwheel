// Support workflow as built on feature/support-remote-config (STAFF_API.md §5 "As built"): inbox
// with filters (q = a ref or words), ticket with timeline, status / assignee / priority with
// expectedVersion (409 TICKET_CONFLICT; setting the current value is a no-op), notes and replies
// that never bump the version, reply delivery with retry, the assignee list and the provider
// status. Every write answers the ticket with its timeline. Audit entries never carry text.
import { http, HttpResponse } from 'msw';
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type ReplyDelivery,
  type TicketPriority,
  type TicketStatus,
  type TimelineEvent,
} from '@/features/support/api/types';
import { accountPermissions } from '../data/staff';
import { screenshotSvg, type StoredTicket } from '../data/support';
import { db, recordAudit } from '../db';
import { guard, type MockActor } from '../session';
import { apiError, badRequest, nowIso, oid, p, paginate, randomToken, readJson } from '../utils';

/** A ticket keeps at most this many timeline entries (409 TICKET_TIMELINE_FULL). */
export const MAX_TIMELINE_ENTRIES = 500;

const find = (id: unknown) => db().support.tickets.find((t) => t.id === String(id));
const notFound = () => apiError(404, 'No support ticket with that id', 'TICKET_NOT_FOUND');
const timelineFull = () =>
  apiError(409, 'This ticket has too much history. Close it and continue on a new one.', 'TICKET_TIMELINE_FULL');

/** Active staff holding support.read: who can be assigned. */
function assignees() {
  const s = db().staff;
  return s.accounts
    .filter((a) => !a.disabled && accountPermissions(a, s.customRoles).includes('support.read'))
    .map((a) => ({ id: a.id, displayName: a.displayName }));
}

/** TicketView (list row): no timeline. */
const row = ({ timeline: _t, ...t }: StoredTicket) => t;
/** TicketDetailView: the ticket and its timeline, oldest first. */
const detail = (t: StoredTicket) => ({ ...row(t), timeline: t.timeline });

const entry = (me: MockActor, e: Record<string, unknown>): TimelineEvent =>
  ({ id: oid(`entry:${randomToken(8)}`), at: nowIso(), actor: me.userId, actorName: me.name, ...e }) as TimelineEvent;

function push(t: StoredTicket, e: TimelineEvent, bump: boolean) {
  t.timeline.push(e);
  if (bump) t.version += 1;
  t.updatedAt = e.at;
}

const provider = () => db().support.provider;
const canSend = () => provider() !== 'none';

/**
 * The queued delivery (`support.reply.deliver`), run at once in the mock. Without a provider the
 * reply stays pending (NO_EMAIL_PROVIDER, no attempt); a provider's acceptance is the only way to
 * `sent`; a refusal is `failed` with SEND_FAILED (a code, never the provider's message).
 */
function deliver(d: ReplyDelivery): ReplyDelivery {
  if (!canSend()) return { ...d, status: 'pending', provider: null, lastError: 'NO_EMAIL_PROVIDER' };
  const attempts = d.attempts + 1;
  if (provider() === 'failing')
    return { ...d, provider: provider(), attempts, status: 'failed', lastError: 'SEND_FAILED' };
  return { status: 'sent', provider: provider(), attempts, lastError: null, sentAt: nowIso() };
}

/** A versioned change: 409 TICKET_CONFLICT on a stale version; the current value is a no-op. */
async function versioned(
  request: Request,
  id: unknown,
  apply: (
    t: StoredTicket,
    body: Record<string, unknown>,
  ) => Response | { same: true } | { entry: TimelineEvent; audit: () => void },
) {
  const t = find(id);
  if (!t) return notFound();
  const body = await readJson(request);
  if (typeof body.expectedVersion !== 'number' || body.expectedVersion < 0)
    return badRequest('expectedVersion must be a number');
  if (body.expectedVersion !== t.version)
    return apiError(409, 'The ticket changed since you loaded it.', 'TICKET_CONFLICT');
  const out = apply(t, body);
  if (out instanceof Response) return out;
  if ('same' in out) return HttpResponse.json(detail(t));
  if (t.timeline.length >= MAX_TIMELINE_ENTRIES) return timelineFull();
  push(t, out.entry, true);
  out.audit();
  return HttpResponse.json(detail(t));
}

/** `q`: a ref ("TW-SUP-1A2B3C", any case, prefix optional) or words in the ticket text. */
function matches(t: StoredTicket, q: string): boolean {
  const ref = /^(?:TW-SUP-)?([0-9a-f]{6})$/i.exec(q.trim());
  if (ref) return t.ref === `TW-SUP-${ref[1]!.toUpperCase()}`;
  return t.text.toLowerCase().includes(q.trim().toLowerCase());
}

export const supportHandlers = [
  http.get(p('support/tickets'), ({ request }) =>
    guard(request, 'support.read', (me) => {
      const url = new URL(request.url);
      const q = url.searchParams;
      const status = q.get('status');
      const priority = q.get('priority');
      if (status && !TICKET_STATUSES.includes(status as TicketStatus))
        return badRequest(`status must be one of the following values: ${TICKET_STATUSES.join(', ')}`);
      if (priority && !TICKET_PRIORITIES.includes(priority as TicketPriority))
        return badRequest(`priority must be one of the following values: ${TICKET_PRIORITIES.join(', ')}`);
      const assignee = q.get('assignee');
      const userId = q.get('userId');
      const term = (q.get('q') ?? '').trim();
      const rows = db()
        .support.tickets.filter(
          (t) =>
            (!status || t.status === status) &&
            (!priority || t.priority === priority) &&
            (!assignee ||
              (assignee === 'me'
                ? t.assignee === me.staffId
                : assignee === 'unassigned'
                  ? !t.assignee
                  : t.assignee === assignee)) &&
            (!userId || t.userId === userId) &&
            (!term || matches(t, term)),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(row);
      return HttpResponse.json(paginate(rows, url));
    }),
  ),

  http.get(p('support/assignees'), ({ request }) =>
    guard(request, 'support.read', () => HttpResponse.json(assignees())),
  ),

  http.get(p('support/delivery-status'), ({ request }) =>
    guard(request, 'support.read', () =>
      HttpResponse.json({ provider: canSend() ? provider() : 'none', canSend: canSend() }),
    ),
  ),

  http.get(p('support/tickets/:id'), ({ request, params }) =>
    guard(request, 'support.read', () => {
      if (!/^[a-f0-9]{24}$/.test(String(params.id))) return badRequest('id must be a mongodb id');
      const t = find(params.id);
      return t ? HttpResponse.json(detail(t)) : notFound();
    }),
  ),

  http.put(p('support/tickets/:id/status'), ({ request, params }) =>
    guard(request, 'support.resolve', (me) =>
      versioned(request, params.id, (t, b) => {
        if (!TICKET_STATUSES.includes(b.status as TicketStatus))
          return badRequest(`status must be one of the following values: ${TICKET_STATUSES.join(', ')}`);
        const from = t.status;
        const to = b.status as TicketStatus;
        if (from === to) return { same: true };
        t.status = to;
        return {
          entry: entry(me, { type: 'status', from, to }),
          audit: () => recordAudit(me, 'support.status', `support_ticket:${t.id}`, { userId: t.userId, from, to }),
        };
      }),
    ),
  ),

  http.put(p('support/tickets/:id/assignee'), ({ request, params }) =>
    guard(request, 'support.assign', (me) =>
      versioned(request, params.id, (t, b) => {
        const to = b.staffId === null ? null : String(b.staffId ?? '');
        if (t.assignee === to) return { same: true };
        const who = to === null ? null : assignees().find((a) => a.id === to);
        if (to !== null && !who)
          return apiError(
            400,
            'Only active staff who can read support tickets can be assigned.',
            'ASSIGNEE_NOT_ELIGIBLE',
          );
        const from = t.assignee;
        const fromName = t.assigneeName;
        t.assignee = to;
        t.assigneeName = who?.displayName ?? null;
        return {
          entry: entry(me, { type: 'assignee', from, to, fromName, toName: t.assigneeName }),
          audit: () => recordAudit(me, 'support.assign', `support_ticket:${t.id}`, { userId: t.userId, from, to }),
        };
      }),
    ),
  ),

  http.put(p('support/tickets/:id/priority'), ({ request, params }) =>
    guard(request, 'support.prioritize', (me) =>
      versioned(request, params.id, (t, b) => {
        if (!TICKET_PRIORITIES.includes(b.priority as TicketPriority))
          return badRequest(`priority must be one of the following values: ${TICKET_PRIORITIES.join(', ')}`);
        const from = t.priority;
        const to = b.priority as TicketPriority;
        if (from === to) return { same: true };
        t.priority = to;
        return {
          entry: entry(me, { type: 'priority', from, to }),
          audit: () => recordAudit(me, 'support.priority', `support_ticket:${t.id}`, { userId: t.userId, from, to }),
        };
      }),
    ),
  ),

  // Notes and replies never bump the version: a note never makes someone's status change fail.
  http.post(p('support/tickets/:id/notes'), ({ request, params }) =>
    guard(request, 'support.note', async (me) => {
      const t = find(params.id);
      if (!t) return notFound();
      const { text } = await readJson<{ text?: unknown }>(request);
      if (typeof text !== 'string' || !text.trim() || text.length > 4000)
        return badRequest('text must be 1 to 4000 characters and not blank');
      if (t.timeline.length >= MAX_TIMELINE_ENTRIES) return timelineFull();
      const e = entry(me, { type: 'note', text: text.trim() });
      push(t, e, false);
      recordAudit(me, 'support.note', `support_ticket:${t.id}`, { userId: t.userId, noteId: e.id });
      return HttpResponse.json(detail(t), { status: 201 });
    }),
  ),

  http.post(p('support/tickets/:id/replies'), ({ request, params }) =>
    guard(request, 'support.reply', async (me) => {
      const t = find(params.id);
      if (!t) return notFound();
      const { text } = await readJson<{ text?: unknown }>(request);
      if (typeof text !== 'string' || !text.trim() || text.length > 8000)
        return badRequest('text must be 1 to 8000 characters and not blank');
      if (t.timeline.length >= MAX_TIMELINE_ENTRIES) return timelineFull();
      // Saved pending, then the queue hands it to the provider (run at once here).
      const pending: ReplyDelivery = {
        status: 'pending',
        provider: canSend() ? provider() : null,
        attempts: 0,
        lastError: canSend() ? null : 'NO_EMAIL_PROVIDER',
        sentAt: null,
      };
      const e = entry(me, { type: 'reply', text: text.trim(), delivery: deliver(pending) });
      push(t, e, false);
      recordAudit(me, 'support.reply', `support_ticket:${t.id}`, { userId: t.userId, replyId: e.id });
      return HttpResponse.json(detail(t), { status: 201 });
    }),
  ),

  http.post(p('support/tickets/:id/replies/:replyId/retry'), ({ request, params }) =>
    guard(request, 'support.reply', (me) => {
      const t = find(params.id);
      if (!t) return notFound();
      const e = t.timeline.find((x) => x.id === params.replyId && x.type === 'reply');
      if (!e || e.type !== 'reply') return apiError(404, 'No such reply on this ticket.', 'REPLY_NOT_FOUND');
      if (e.delivery.status === 'sent') return apiError(409, 'This reply was already sent.', 'REPLY_ALREADY_SENT');
      e.delivery = deliver({ ...e.delivery, status: 'pending' });
      recordAudit(me, 'support.reply', `support_ticket:${t.id}`, { userId: t.userId, replyId: e.id, retry: true });
      return HttpResponse.json(detail(t));
    }),
  ),

  // The real API streams the stored jpeg/png/webp/heic; the mock draws a placeholder.
  http.get(p('support/tickets/:id/screenshot'), ({ request, params }) =>
    guard(request, 'support.read', () => {
      const t = find(params.id);
      if (!t) return notFound();
      if (!t.hasScreenshot) return apiError(404, 'This ticket has no screenshot', 'SCREENSHOT_NOT_FOUND');
      return new HttpResponse(screenshotSvg(t), {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, no-store' },
      });
    }),
  ),
];
