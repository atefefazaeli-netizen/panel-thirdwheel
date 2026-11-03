// Mock integrations: three n8n webhooks (one disabled), a month of deliveries, two API keys.
import type { ApiKey, ApiKeyScope, Delivery, DeliveryEvent, Webhook } from '@/features/integrations/api/types';
import { daysAgo, oid, randomToken } from '../utils';
import { uid } from './users';

export interface IntegrationsState {
  webhooks: Webhook[];
  /** Mock only: the current signing secret per webhook (the API stores it encrypted). */
  secrets: Map<string, string>;
  deliveries: Delivery[];
  apiKeys: ApiKey[];
  /** Mock only: full key → key id (the API stores a SHA-256 hash). */
  keyIndex: Map<string, string>;
}

export const newSecret = () => `whsec_${randomToken(43)}`;

export function envelope(type: DeliveryEvent, data: Record<string, unknown>, at: string): Delivery['payload'] {
  return { id: `evt_${randomToken(24).toLowerCase()}`, type, createdAt: at, data };
}

export function seedIntegrations(): IntegrationsState {
  const webhooks: Webhook[] = [
    {
      id: oid('wh:crisis'),
      name: 'On-call crisis alerts',
      url: 'https://n8n.thirdwheel.app/webhook/crisis-oncall',
      events: ['crisis.alert'],
      enabled: true,
      createdAt: daysAgo(14),
      lastDeliveryAt: daysAgo(0, 2),
      lastStatus: 'delivered',
      secretHint: '',
    },
    {
      id: oid('wh:support'),
      name: 'Support tickets to Google Sheets',
      url: 'https://n8n.thirdwheel.app/webhook/support-sheet',
      events: ['support.ticket.created'],
      enabled: true,
      createdAt: daysAgo(10),
      lastDeliveryAt: daysAgo(0, 4),
      lastStatus: 'failed',
      secretHint: '',
    },
    {
      id: oid('wh:content'),
      name: 'Content published to Expo push',
      url: 'https://n8n.thirdwheel.app/webhook/content-push',
      events: ['content.published', 'user.subscription.changed'],
      enabled: false,
      createdAt: daysAgo(7),
      lastDeliveryAt: daysAgo(5),
      lastStatus: 'delivered',
      secretHint: '',
    },
  ];
  const secrets = new Map<string, string>();
  for (const w of webhooks) {
    const s = newSecret();
    secrets.set(w.id, s);
    w.secretHint = s.slice(-4);
  }

  const deliveries: Delivery[] = [];
  const add = (
    i: number,
    webhookId: string,
    event: DeliveryEvent,
    status: Delivery['status'],
    hours: number,
    data: Record<string, unknown>,
  ) => {
    const at = daysAgo(0, hours);
    const failed = status === 'failed';
    deliveries.push({
      id: oid(`dlv:${i}`),
      webhookId,
      event,
      status,
      attempts: failed ? 6 : status === 'pending' ? 2 : 1,
      lastStatusCode: failed ? 502 : status === 'pending' ? 500 : 200,
      lastError: failed ? 'Bad gateway from the receiver' : status === 'pending' ? 'Internal server error' : null,
      nextAttemptAt: status === 'pending' ? new Date(Date.now() + 4 * 60_000).toISOString() : null,
      createdAt: at,
      deliveredAt: status === 'delivered' ? at : null,
      payload: envelope(event, data, at),
    });
  };
  const [crisis, support, content] = webhooks.map((w) => w.id) as [string, string, string];
  const panel = 'https://panel.thirdwheel.app';
  const flag = (n: number, level: string, extra: Record<string, unknown> = {}) => ({
    flagId: oid(`flag:${n}`),
    userId: uid(['priya', 'noor', 'theo', 'clara', 'dana'][n % 5]!),
    kind: level === 'high' ? 'crisis' : 'safety',
    level,
    surface: 'third-ear',
    helplineShown: true,
    count: 1,
    at: daysAgo(0, n * 7),
    escalated: false,
    escalatedBy: null,
    note: null,
    panelUrl: `${panel}/safety/${oid(`flag:${n}`)}`,
    ...extra,
  });
  const ticket = (n: number) => ({
    ticketId: oid(`ticket:${n}`),
    ref: `TW-SUP-${oid(`ticket:${n}`).slice(-6).toUpperCase()}`,
    userId: uid(['sara', 'alex', 'maya', 'jonas'][n % 4]!),
    kind: n % 2 ? 'message' : 'problem',
    topic: n % 2 ? 'Subscription' : null,
    text: 'The Plans tab spins forever after I add a memory.',
    hasScreenshot: n % 2 === 0,
    at: daysAgo(0, n * 5),
    panelUrl: `${panel}/support/${oid(`ticket:${n}`)}`,
  });
  let i = 0;
  add(i++, crisis, 'crisis.alert', 'delivered', 2, flag(0, 'high'));
  add(i++, support, 'support.ticket.created', 'failed', 4, ticket(0));
  add(i++, support, 'support.ticket.created', 'pending', 1, ticket(1));
  add(
    i++,
    crisis,
    'crisis.alert',
    'delivered',
    30,
    flag(1, 'high', { escalated: true, escalatedBy: uid('lead'), note: 'Repeated checks this week.' }),
  );
  add(i++, crisis, 'ping', 'delivered', 50, { message: 'Thirdwheel webhook test', at: daysAgo(0, 50) });
  for (let n = 2; n < 20; n++) {
    if (n % 3 === 0)
      add(
        i++,
        crisis,
        'crisis.alert',
        n === 9 ? 'failed' : 'delivered',
        20 + n * 9,
        flag(n, n % 2 ? 'medium' : 'high'),
      );
    else if (n % 3 === 1)
      add(i++, support, 'support.ticket.created', n === 7 ? 'failed' : 'delivered', 20 + n * 9, ticket(n));
    else
      add(i++, content, 'content.published', 'delivered', 120 + n * 3, {
        itemId: 'my-perfect-day',
        code: 'Q-2-01',
        pillar: 'quiz',
        title: 'My perfect day',
        version: 2,
        action: 'published',
        by: uid('doctor'),
        at: daysAgo(0, 120 + n * 3),
      });
  }

  const apiKeys: ApiKey[] = [
    {
      id: oid('key:sheets'),
      name: 'n8n clinician sheets',
      prefix: 'a1b2c3d4',
      scopes: ['content.import'],
      createdAt: daysAgo(12),
      lastUsedAt: daysAgo(1),
      revokedAt: null,
    },
    {
      id: oid('key:moderation'),
      name: 'n8n moderation flow',
      prefix: 'e5f6a7b8',
      scopes: ['users.flag'] as ApiKeyScope[],
      createdAt: daysAgo(20),
      lastUsedAt: daysAgo(9),
      revokedAt: daysAgo(8),
    },
  ];
  return { webhooks, secrets, deliveries, apiKeys, keyIndex: new Map() };
}
