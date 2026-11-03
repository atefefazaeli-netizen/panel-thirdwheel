import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { contentApi } from '@/features/content/api/content-api';
import { integrationsApi } from '@/features/integrations/api/integrations-api';
import { safetyApi } from '@/features/safety/api/safety-api';
import type { AdminStats } from './types';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: () => [...dashboardKeys.all, 'stats'] as const,
  review: () => [...dashboardKeys.all, 'review'] as const,
  highFlags: () => [...dashboardKeys.all, 'high-flags'] as const,
  failed: () => [...dashboardKeys.all, 'failed-deliveries'] as const,
};

/** Refreshed every minute: the sidebar badges read it too. */
export const useAdminStats = (enabled = true) =>
  useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: () => api.get<AdminStats>('admin/stats'),
    refetchInterval: 60_000,
    enabled,
  });

export const useReviewPreview = () =>
  useQuery({ queryKey: dashboardKeys.review(), queryFn: () => contentApi.list({ state: 'in_review', limit: 5 }) });
export const useHighFlagsPreview = () =>
  useQuery({
    queryKey: dashboardKeys.highFlags(),
    queryFn: () => safetyApi.list({ status: 'open', level: 'high', limit: 5 }),
  });
export const useFailedDeliveries = (enabled: boolean) =>
  useQuery({
    queryKey: dashboardKeys.failed(),
    queryFn: () => integrationsApi.deliveries({ status: 'failed', limit: 5 }),
    enabled,
  });
