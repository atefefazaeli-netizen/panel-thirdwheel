// Support workflow (STAFF_API.md §5): inbox with filters, ticket with timeline, status, assignee,
// priority (expectedVersion, 409 TICKET_CONFLICT), internal notes, replies with delivery status
// and retry, the assignee list and the email provider status. Audit entries never carry text.
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
import { apiError, badRequest, mockId, nowIso, p, paginate, readJson } from '../utils';

const find = (id: unknown) => db().support.tickets.find((t) => t.id === String(id));
const notFound = () => apiError(404, 'No support ticket with that id', 'TICKET_NOT_FOUND');

/** Active staff holding support.read: who can be assigned. */
function assignees() {
  const s = db().staff;
  return s.accounts
    .filter((a) => !a.disabled && accountPermissions(a, s.customRoles).includes('support.read'))
    .map((a) => ({ id: a.id, displayName: a.displayName }));
}
const nameOf = (staffId: string | null) =>
  staffId ? (assignees().find((a) => a.id === staffId)?.displayName ?? null) : null;

/** The ticket as the API answers it (list rows have no timeline). */
const row = ({ timeline: _t, ...t }: StoredTicket) => ({ ...t, assigneeName: nameOf(t.assigneeId) });
const detail = (t: StoredTicket) => ({ ...row(t), timeline: t.timeline });

function event(me: MockActor, e: Record<string, unknown>): TimelineEvent {
  return { id: mockId('ev_'), at: nowIso(), by: me.userId, byName: me.name, ...e } as TimelineEvent;
}

/** Sends a reply through the configured provider (none: stays pending with NO_EMAIL_PROVIDER). */
function deliver(d: ReplyDelivery): ReplyDelivery {
  const provider = db().support.provider;
  const attempts = d.attempts + 1;
  if (provider === 'none') return { ...d, attempts, provider: null, status: 'pending', lastError: 'NO_EMAIL_PROVIDER' };
  if (provider === 'failing')
    return { ...d, attempts, provider, status: 'failed', lastError: 'The provider refused the message (550).' };
  return { status: 'sent', provider, attempts, lastError: null, sentAt: nowIso() };
}

/** A versioned change: 409 TICKET_CONFLICT when the client's version is stale. */
async function versioned(
  request: Request,
  id: unknown,
  apply: (t: StoredTicket, body: Record<string, unknown>) => Response | TimelineEvent,
) {
  const t = find(id);
  if (!t) return notFound();
  const body = await readJson(request);
  if (typeof body.expectedVersion !== 'number') return badRequest('expectedVersion must be a number');
  if (body.expectedVersion !== t.version)
    return apiError(409, 'The ticket changed since you loaded it.', 'TICKET_CONFLICT', {
      details: [`version: you had ${body.expectedVersion}, the ticket is at ${t.version}`],
    });
  const out = apply(t, body);
  if (out instanceof Response) return out;
  t.timeline.push(out);
  t.version += 1;
  t.updatedAt = out.at;
  return HttpResponse.json(row(t));
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
      const term = (q.get('q') ?? '').trim().toLowerCase();
      const rows = db()
        .support.tickets.filter(
          (t) =>
            (!status || t.status === status) &&
            (!priority || t.priority === priority) &&
            (!assignee ||
              (assignee === 'me'
                ? t.assigneeId === me.staffId
                : assignee === 'unassigned'
                  ? !t.assigneeId
                  : t.assigneeId === assignee)) &&
            (!userId || t.userId === userId) &&
            (!term || t.text.toLowerCase().includes(term) || t.ref.toLowerCase().includes(term)),
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
    guard(request, 'support.read', () => {
      const provider = db().support.provider;
      return HttpResponse.json({ provider, canSend: provider !== 'none' });
    }),
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
        t.status = b.status as TicketStatus;
        recordAudit(me, 'support.ticket_status', `support_ticket:${t.id}`, { userId: t.userId, status: t.status });
        return event(me, { type: 'status', from, to: t.status });
      }),
    ),
  ),

  http.put(p('support/tickets/:id/assignee'), ({ request, params }) =>
    guard(request, 'support.assign', (me) =>
      versioned(request, params.id, (t, b) => {
        const to = b.staffId === null ? null : String(b.staffId ?? '');
        if (to !== null && !assignees().some((a) => a.id === to))
          return apiError(400, 'The assignee must hold support.read.', 'ASSIGNEE_INVALID');
        const from = t.assigneeId;
        t.assigneeId = to;
        recordAudit(me, 'support.ticket_assign', `support_ticket:${t.id}`, { userId: t.userId, assignee: to });
        return event(me, { type: 'assignee', from, to, fromName: nameOf(from), toName: nameOf(to) });
      }),
    ),
  ),

  http.put(p('support/tickets/:id/priority'), ({ request, params }) =>
    guard(request, 'support.prioritize', (me) =>
      versioned(request, params.id, (t, b) => {
        if (!TICKET_PRIORITIES.includes(b.priority as TicketPriority))
          return badRequest(`priority must be one of the following values: ${TICKET_PRIORITIES.join(', ')}`);
        const from = t.priority;
        t.priority = b.priority as TicketPriority;
        recordAudit(me, 'support.ticket_priority', `support_ticket:${t.id}`, {
          userId: t.userId,
          priority: t.priority,
        });
        return event(me, { type: 'priority', from, to: t.priority });
      }),
    ),
  ),

  http.post(p('support/tickets/:id/notes'), ({ request, params }) =>
    guard(request, 'support.note', async (me) => {
      const t = find(params.id);
      if (!t) return notFound();
      const { text } = await readJson<{ text?: unknown }>(request);
      if (typeof text !== 'string' || !text.trim() || text.length > 4000)
        return badRequest('text must be 1 to 4000 characters');
      const e = event(me, { type: 'note', text: text.trim() });
      t.timeline.push(e);
      recordAudit(me, 'support.ticket_note', `support_ticket:${t.id}`, { userId: t.userId });
      return HttpResponse.json(e, { status: 201 });
    }),
  ),

  http.post(p('support/tickets/:id/replies'), ({ request, params }) =>
    guard(request, 'support.reply', async (me) => {
      const t = find(params.id);
      if (!t) return notFound();
      const { text } = await readJson<{ text?: unknown }>(request);
      if (typeof text !== 'string' || !text.trim() || text.length > 8000)
        return badRequest('text must be 1 to 8000 characters');
      const delivery = deliver({ status: 'pending', provider: null, attempts: 0, lastError: null, sentAt: null });
      const e = event(me, { type: 'reply', text: text.trim(), delivery });
      t.timeline.push(e);
      recordAudit(me, 'support.ticket_reply', `support_ticket:${t.id}`, {
        userId: t.userId,
        delivery: delivery.status,
      });
      return HttpResponse.json(
        { id: e.id, text: text.trim(), by: e.by, byName: e.byName, at: e.at, delivery },
        { status: 201 },
      );
    }),
  ),

  http.post(p('support/tickets/:id/replies/:replyId/retry'), ({ request, params }) =>
    guard(request, 'support.reply', (me) => {
      const t = find(params.id);
      if (!t) return notFound();
      const e = t.timeline.find((x) => x.id === params.replyId && x.type === 'reply');
      if (!e || e.type !== 'reply') return apiError(404, 'No such reply', 'REPLY_NOT_FOUND');
      if (e.delivery.status !== 'sent') e.delivery = deliver(e.delivery);
      recordAudit(me, 'support.ticket_reply_retry', `support_ticket:${t.id}`, {
        userId: t.userId,
        delivery: e.delivery.status,
      });
      return HttpResponse.json({ id: e.id, text: e.text, by: e.by, byName: e.byName, at: e.at, delivery: e.delivery });
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
