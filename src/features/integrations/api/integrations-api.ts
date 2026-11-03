import { api, normalizePage, type Paginated } from '@/lib/api';
import type { ApiKey, ApiKeyScope, Delivery, DeliveryQuery, Webhook, WebhookInput, WebhookWithSecret } from './types';

const w = (id: string) => `admin/integrations/webhooks/${encodeURIComponent(id)}`;

export const integrationsApi = {
  webhooks: () => api.get<Webhook[]>('admin/integrations/webhooks'),
  createWebhook: (input: WebhookInput) => api.post<WebhookWithSecret>('admin/integrations/webhooks', input),
  updateWebhook: (id: string, patch: Partial<WebhookInput>) => api.patch<Webhook>(w(id), patch),
  deleteWebhook: (id: string) => api.delete<void>(w(id)),
  rotateSecret: (id: string) => api.post<WebhookWithSecret>(`${w(id)}/rotate-secret`),
  testWebhook: (id: string) => api.post<Delivery>(`${w(id)}/test`),
  deliveries: async (q: DeliveryQuery): Promise<Paginated<Delivery>> =>
    normalizePage(await api.get('admin/integrations/deliveries', { query: { ...q } })),
  retryDelivery: (id: string) => api.post<Delivery>(`admin/integrations/deliveries/${encodeURIComponent(id)}/retry`),
  apiKeys: () => api.get<ApiKey[]>('admin/integrations/api-keys'),
  createApiKey: (input: { name: string; scopes: ApiKeyScope[] }) =>
    api.post<{ apiKey: ApiKey; key: string }>('admin/integrations/api-keys', input),
  revokeApiKey: (id: string) => api.delete<void>(`admin/integrations/api-keys/${encodeURIComponent(id)}`),
};
