// ADMIN_API.md › Integrations (n8n): webhooks, deliveries, API keys (admin) and the incoming
// n8n action route (API key). Subscribed events become deliveries that settle a moment later.
import { http, HttpResponse } from 'msw';
import type { ApiKeyScope, Delivery, DeliveryEvent, WebhookEvent } from '@/features/integrations/api/types';
import { envelope, newSecret } from '../data/integrations';
import { db, recordAudit } from '../db';
import { onMockEvent } from '../events';
import { guard } from '../session';
import { apiError, badRequest, mockId, nowIso, p, paginate, randomToken, readJson } from '../utils';

const EVENTS: WebhookEvent[] = [
  'crisis.alert',
  'support.ticket.created',
  'content.published',
  'user.subscription.changed',
];
const SCOPES: ApiKeyScope[] = ['users.flag', 'content.import'];
const TAG_RE = /^[a-z0-9-]{1,32}$/;

const hook = (id: unknown) => db().integrations.webhooks.find((w) => w.id === String(id));
const hookMissing = () => apiError(404, 'Webhook not found', 'WEBHOOK_NOT_FOUND');

function urlProblem(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw || raw.length > 2000) return 'url must be 1 to 2000 characters';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'Only http and https URLs';
    if (u.username || u.password) return 'No user name or password in the URL';
  } catch {
    return 'Not a URL';
  }
  return null;
}

/** A delivery attempt: receivers whose URL mentions "fail" answer 502, the rest 200. */
function settle(id: string) {
  setTimeout(() => {
    const d = db().integrations.deliveries.find((x) => x.id === id);
    const w = d && hook(d.webhookId);
    if (!d || d.status !== 'pending') return;
    const ok = !w || !/fail|broken/.test(w.url);
    d.attempts += 1;
    d.lastStatusCode = ok ? 200 : 502;
    d.lastError = ok ? null : 'Bad gateway from the receiver';
    d.status = ok ? 'delivered' : d.attempts >= 6 ? 'failed' : 'pending';
    d.deliveredAt = ok ? nowIso() : null;
    d.nextAttemptAt = d.status === 'pending' ? new Date(Date.now() + 60_000).toISOString() : null;
    if (w) {
      w.lastDeliveryAt = nowIso();
      w.lastStatus = ok ? 'delivered' : 'failed';
    }
  }, 1200);
}

function enqueue(webhookId: string, event: DeliveryEvent, data: Record<string, unknown>, id = mockId('d')): Delivery {
  const at = nowIso();
  const d: Delivery = {
    id,
    webhookId,
    event,
    status: 'pending',
    attempts: 0,
    lastStatusCode: null,
    lastError: null,
    nextAttemptAt: at,
    createdAt: at,
    deliveredAt: null,
    payload: envelope(event, data, at),
  };
  db().integrations.deliveries.unshift(d);
  settle(d.id);
  return d;
}

// Events from the other mock modules turn into deliveries for enabled, subscribed webhooks.
onMockEvent((type, data) => {
  if (!EVENTS.includes(type as WebhookEvent)) return;
  for (const w of db().integrations.webhooks)
    if (w.enabled && w.events.includes(type as WebhookEvent)) enqueue(w.id, type as WebhookEvent, data);
});

function validEvents(events: unknown): events is WebhookEvent[] {
  return Array.isArray(events) && events.every((e) => EVENTS.includes(e as WebhookEvent));
}

export const integrationsHandlers = [
  http.get(p('admin/integrations/webhooks'), ({ request }) =>
    guard(request, 'integrations.read', () => HttpResponse.json(db().integrations.webhooks)),
  ),

  http.post(p('admin/integrations/webhooks'), ({ request }) =>
    guard(request, 'integrations.manage', async (me) => {
      const b = await readJson<{ name?: string; url?: string; events?: unknown; enabled?: boolean }>(request);
      if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 80)
        return badRequest('name must be 1 to 80 characters');
      const bad = urlProblem(b.url);
      if (bad) return apiError(400, bad, 'WEBHOOK_URL_INVALID');
      if (!validEvents(b.events))
        return badRequest('each value in events must be one of the following values: ' + EVENTS.join(', '));
      if (typeof b.enabled !== 'boolean') return badRequest('enabled must be a boolean value');
      const secret = newSecret();
      const webhook = {
        id: mockId('w'),
        name: b.name.trim(),
        url: b.url!,
        events: b.events,
        enabled: b.enabled,
        createdAt: nowIso(),
        lastDeliveryAt: null,
        lastStatus: null,
        secretHint: secret.slice(-4),
      };
      db().integrations.webhooks.push(webhook);
      db().integrations.secrets.set(webhook.id, secret);
      recordAudit(me, 'webhook.create', `webhook:${webhook.id}`, { events: webhook.events });
      return HttpResponse.json({ webhook, secret }, { status: 201 });
    }),
  ),

  http.patch(p('admin/integrations/webhooks/:id'), ({ request, params }) =>
    guard(request, 'integrations.manage', async (me) => {
      const w = hook(params.id);
      if (!w) return hookMissing();
      const b = await readJson<{ name?: string; url?: string; events?: unknown; enabled?: boolean }>(request);
      if (b.name !== undefined && (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 80))
        return badRequest('name must be 1 to 80 characters');
      if (b.url !== undefined) {
        const bad = urlProblem(b.url);
        if (bad) return apiError(400, bad, 'WEBHOOK_URL_INVALID');
      }
      if (b.events !== undefined && !validEvents(b.events)) return badRequest('Unknown event');
      Object.assign(w, {
        ...(b.name !== undefined ? { name: b.name.trim() } : {}),
        ...(b.url !== undefined ? { url: b.url } : {}),
        ...(b.events !== undefined ? { events: b.events } : {}),
        ...(typeof b.enabled === 'boolean' ? { enabled: b.enabled } : {}),
      });
      recordAudit(me, 'webhook.update', `webhook:${w.id}`, { fields: Object.keys(b) });
      return HttpResponse.json(w);
    }),
  ),

  http.delete(p('admin/integrations/webhooks/:id'), ({ request, params }) =>
    guard(request, 'integrations.manage', (me) => {
      const s = db().integrations;
      const w = hook(params.id);
      if (!w) return hookMissing();
      s.webhooks = s.webhooks.filter((x) => x !== w);
      for (const d of s.deliveries)
        if (d.webhookId === w.id && d.status === 'pending')
          Object.assign(d, { status: 'failed', lastError: 'The webhook was deleted', nextAttemptAt: null });
      recordAudit(me, 'webhook.delete', `webhook:${w.id}`);
      return new HttpResponse(null, { status: 204 });
    }),
  ),

  http.post(p('admin/integrations/webhooks/:id/rotate-secret'), ({ request, params }) =>
    guard(request, 'integrations.manage', (me) => {
      const w = hook(params.id);
      if (!w) return hookMissing();
      const secret = newSecret();
      db().integrations.secrets.set(w.id, secret);
      w.secretHint = secret.slice(-4);
      recordAudit(me, 'webhook.rotate_secret', `webhook:${w.id}`);
      return HttpResponse.json({ webhook: w, secret });
    }),
  ),

  http.post(p('admin/integrations/webhooks/:id/test'), ({ request, params }) =>
    guard(request, 'integrations.manage', (me) => {
      const w = hook(params.id);
      if (!w) return hookMissing();
      // Sent even when the webhook is disabled or not subscribed.
      const d = enqueue(w.id, 'ping', { message: 'Thirdwheel webhook test', at: nowIso() });
      recordAudit(me, 'webhook.test', `webhook:${w.id}`);
      return HttpResponse.json(d);
    }),
  ),

  http.get(p('admin/integrations/deliveries'), ({ request }) =>
    guard(request, 'integrations.read', () => {
      const url = new URL(request.url);
      const q = url.searchParams;
      const rows = db()
        .integrations.deliveries.filter(
          (d) =>
            (!q.get('webhookId') || d.webhookId === q.get('webhookId')) &&
            (!q.get('event') || d.event === q.get('event')) &&
            (!q.get('status') || d.status === q.get('status')),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return HttpResponse.json(paginate(rows, url));
    }),
  ),

  http.post(p('admin/integrations/deliveries/:id/retry'), ({ request, params }) =>
    guard(request, 'integrations.manage', (me) => {
      const d = db().integrations.deliveries.find((x) => x.id === String(params.id));
      if (!d) return apiError(404, 'Delivery not found', 'DELIVERY_NOT_FOUND');
      // A fresh run of 6 attempts with the same delivery id.
      Object.assign(d, {
        status: 'pending',
        attempts: 0,
        lastError: null,
        lastStatusCode: null,
        nextAttemptAt: nowIso(),
        deliveredAt: null,
      });
      settle(d.id);
      recordAudit(me, 'webhook.delivery_retry', `delivery:${d.id}`);
      return HttpResponse.json(d);
    }),
  ),

  http.get(p('admin/integrations/api-keys'), ({ request }) =>
    guard(request, 'integrations.read', () => HttpResponse.json(db().integrations.apiKeys)),
  ),

  http.post(p('admin/integrations/api-keys'), ({ request }) =>
    guard(request, 'integrations.manage', async (me) => {
      const b = await readJson<{ name?: string; scopes?: unknown }>(request);
      if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 80)
        return badRequest('name must be 1 to 80 characters');
      if (!Array.isArray(b.scopes) || b.scopes.length < 1 || b.scopes.some((s) => !SCOPES.includes(s as ApiKeyScope)))
        return badRequest('scopes must contain at least 1 of users.flag, content.import');
      const prefix = randomToken(8)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, 'x');
      const key = `twk_${prefix}_${randomToken(40)}`;
      const apiKey = {
        id: mockId('k'),
        name: b.name.trim(),
        prefix,
        scopes: [...new Set(b.scopes as ApiKeyScope[])],
        createdAt: nowIso(),
        lastUsedAt: null,
        revokedAt: null,
      };
      db().integrations.apiKeys.unshift(apiKey);
      db().integrations.keyIndex.set(key, apiKey.id);
      recordAudit(me, 'apikey.create', `apikey:${apiKey.id}`, { scopes: apiKey.scopes });
      return HttpResponse.json({ apiKey, key }, { status: 201 });
    }),
  ),

  http.delete(p('admin/integrations/api-keys/:id'), ({ request, params }) =>
    guard(request, 'integrations.manage', (me) => {
      const k = db().integrations.apiKeys.find((x) => x.id === String(params.id));
      if (!k) return apiError(404, 'API key not found', 'API_KEY_NOT_FOUND');
      k.revokedAt ??= nowIso();
      recordAudit(me, 'apikey.revoke', `apikey:${k.id}`);
      return new HttpResponse(null, { status: 204 });
    }),
  ),

  // Incoming n8n actions (public route, X-Api-Key).
  http.post(p('integrations/n8n/action'), async ({ request }) => {
    const s = db().integrations;
    const id = s.keyIndex.get(request.headers.get('x-api-key') ?? '');
    const key = s.apiKeys.find((k) => k.id === id && !k.revokedAt);
    if (!key) return apiError(401, 'Invalid API key', 'API_KEY_INVALID');
    key.lastUsedAt = nowIso();
    const { action, data } = await readJson<{ action?: string; data?: Record<string, unknown> }>(request);
    const need: Record<string, ApiKeyScope> = {
      'user.suspend': 'users.flag',
      'user.unsuspend': 'users.flag',
      'user.tag': 'users.flag',
      'content.import': 'content.import',
    };
    if (!action || !need[action]) return apiError(400, `Unknown action ${action}`, 'UNKNOWN_ACTION');
    if (!key.scopes.includes(need[action]))
      return apiError(403, `This key lacks the ${need[action]} scope`, 'API_KEY_SCOPE');
    const actor = { userId: `apikey:${key.name}`, email: null };
    const user = typeof data?.userId === 'string' ? db().users.get(data.userId) : undefined;
    if (action.startsWith('user.') && !user) return apiError(404, 'User not found', 'USER_NOT_FOUND');
    let result: unknown;
    if (action === 'user.suspend') {
      const reason = String(data?.reason ?? '').trim();
      if (!reason || reason.length > 300)
        return apiError(400, 'reason must be 1 to 300 characters', 'INVALID_ACTION_DATA', { details: ['reason'] });
      user!.account = { ...user!.account, suspended: true, suspendedReason: reason };
      result = user!.account;
    } else if (action === 'user.unsuspend') {
      user!.account = { ...user!.account, suspended: false, suspendedReason: null };
      result = user!.account;
    } else if (action === 'user.tag') {
      const add = (data?.add as string[] | undefined) ?? [];
      const remove = (data?.remove as string[] | undefined) ?? [];
      if (![...add, ...remove].length || [...add, ...remove].some((t) => !TAG_RE.test(t)))
        return apiError(400, 'tags must be 1 to 32 of a-z, 0-9 and -', 'INVALID_ACTION_DATA', {
          details: ['add', 'remove'],
        });
      user!.account = {
        ...user!.account,
        tags: [...new Set([...user!.account.tags.filter((t) => !remove.includes(t)), ...add])],
      };
      result = user!.account;
    } else {
      // content.import goes through the same mock route the panel uses, as n8n.
      return apiError(503, 'Use POST admin/content/import in the mock', 'ACTION_UNAVAILABLE');
    }
    recordAudit(actor, `n8n.${action}`, `user:${String(data?.userId)}`);
    return HttpResponse.json({ ok: true, action, result });
  }),
];
