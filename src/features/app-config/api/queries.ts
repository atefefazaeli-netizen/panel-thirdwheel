import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { appConfigApi } from './app-config-api';
import type { AppConfigBody } from './types';

export const appConfigKeys = {
  all: ['app-config'] as const,
  current: () => [...appConfigKeys.all, 'current'] as const,
  versions: (page: number) => [...appConfigKeys.all, 'versions', page] as const,
};

export const useAppConfig = () => useQuery({ queryKey: appConfigKeys.current(), queryFn: appConfigApi.get });

export const useConfigVersions = (page: number) =>
  useQuery({
    queryKey: appConfigKeys.versions(page),
    queryFn: () => appConfigApi.versions(page),
    placeholderData: keepPreviousData,
  });

export const isConfigConflict = (e: unknown) => e instanceof ApiError && e.code === 'CONFIG_CONFLICT';

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: appConfigKeys.all });
}

export function useSaveConfigDraft() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { config: AppConfigBody; baseVersion: number }) => appConfigApi.saveDraft(v.config, v.baseVersion),
    meta: { silent: true },
    onSuccess: () => invalidate(),
  });
}

export function usePublishConfig() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { baseVersion: number; note?: string }) => appConfigApi.publish(v.baseVersion, v.note),
    meta: { silent: true },
    // Also after a 409 CONFIG_CONFLICT: the page then shows what is published now.
    onSettled: () => invalidate(),
  });
}

export function useRollbackConfig() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { version: number; baseVersion: number; note?: string }) =>
      appConfigApi.rollback(v.version, v.baseVersion, v.note),
    meta: { silent: true },
    onSettled: () => invalidate(),
  });
}
