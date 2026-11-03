// DTOs for ADMIN_API.md › Integrations (n8n): webhooks out, deliveries, API keys in.

export type WebhookEvent =
  'crisis.alert' | 'support.ticket.created' | 'content.published' | 'user.subscription.changed';
export type DeliveryEvent = WebhookEvent | 'ping';
export type DeliveryStatus = 'pending' | 'delivered' | 'failed';
export type ApiKeyScope = 'users.flag' | 'content.import';

export const WEBHOOK_EVENTS: readonly WebhookEvent[] = [
  'crisis.alert',
  'support.ticket.created',
  'content.published',
  'user.subscription.changed',
];
export const DELIVERY_EVENTS: readonly DeliveryEvent[] = [...WEBHOOK_EVENTS, 'ping'];
export const DELIVERY_STATUSES: readonly DeliveryStatus[] = ['pending', 'delivered', 'failed'];
export const API_KEY_SCOPES: readonly ApiKeyScope[] = ['users.flag', 'content.import'];

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  createdAt: string;
  lastDeliveryAt: string | null;
  lastStatus: 'delivered' | 'failed' | null;
  /** Last 4 characters of the signing secret. */
  secretHint: string;
}

export interface WebhookWithSecret {
  webhook: Webhook;
  /** Shown once: `whsec_` + 32 random bytes, base64url. */
  secret: string;
}

export interface Delivery {
  id: string;
  webhookId: string;
  event: DeliveryEvent;
  status: DeliveryStatus;
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
  payload: { id: string; type: DeliveryEvent; createdAt: string; data: Record<string, unknown> };
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface DeliveryQuery {
  webhookId?: string;
  event?: DeliveryEvent;
  status?: DeliveryStatus;
  page?: number;
  limit?: number;
}

export type WebhookInput = { name: string; url: string; events: WebhookEvent[]; enabled: boolean };
