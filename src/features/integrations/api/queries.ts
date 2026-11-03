import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { integrationsApi } from './integrations-api';
import type { ApiKeyScope, DeliveryQuery, WebhookInput } from './types';

export const integrationKeys = {
  all: ['integrations'] as const,
  webhooks: () => [...integrationKeys.all, 'webhooks'] as const,
  deliveries: (q: DeliveryQuery) => [...integrationKeys.all, 'deliveries', q] as const,
  apiKeys: () => [...integrationKeys.all, 'api-keys'] as const,
};

export const useWebhooks = () => useQuery({ queryKey: integrationKeys.webhooks(), queryFn: integrationsApi.webhooks });
/** Pending deliveries change on their own (retries), so the log refreshes while any are pending. */
export const useDeliveries = (q: DeliveryQuery) =>
  useQuery({
    queryKey: integrationKeys.deliveries(q),
    queryFn: () => integrationsApi.deliveries(q),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.items.some((d) => d.status === 'pending') ? 3000 : false),
  });
export const useApiKeys = () => useQuery({ queryKey: integrationKeys.apiKeys(), queryFn: integrationsApi.apiKeys });

function useWrite<V, R>(fn: (v: V) => Promise<R>, opts: { silent?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    meta: { silent: opts.silent },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: integrationKeys.all });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export const useCreateWebhook = () => useWrite((v: WebhookInput) => integrationsApi.createWebhook(v), { silent: true });
export const useUpdateWebhook = () =>
  useWrite((v: { id: string; patch: Partial<WebhookInput> }) => integrationsApi.updateWebhook(v.id, v.patch), {
    silent: true,
  });
export const useDeleteWebhook = () => useWrite((id: string) => integrationsApi.deleteWebhook(id));
export const useRotateSecret = () => useWrite((id: string) => integrationsApi.rotateSecret(id));
export const useTestWebhook = () => useWrite((id: string) => integrationsApi.testWebhook(id));
export const useRetryDelivery = () => useWrite((id: string) => integrationsApi.retryDelivery(id));
export const useCreateApiKey = () =>
  useWrite((v: { name: string; scopes: ApiKeyScope[] }) => integrationsApi.createApiKey(v));
export const useRevokeApiKey = () => useWrite((id: string) => integrationsApi.revokeApiKey(id));
