import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { appConfigApi } from './app-config-api';
import type { AppConfigAdmin, AppConfigBody } from './types';

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

/**
 * Each write answers the new view, which replaces the cached one (a new draft version remounts the
 * editor). The history follows. A conflict does not reload by itself on a draft save, so the
 * person's edits stay on screen until they choose "Load the latest"; publish and rollback have no
 * local edits, so they reload at once.
 */
function useWrite<V>(fn: (v: V) => Promise<AppConfigAdmin>, reloadOnError: boolean) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    meta: { silent: true },
    onSuccess: (view) => {
      qc.setQueryData(appConfigKeys.current(), view);
      void qc.invalidateQueries({ queryKey: [...appConfigKeys.all, 'versions'] });
    },
    onError: () => {
      if (reloadOnError) void qc.invalidateQueries({ queryKey: appConfigKeys.all });
    },
  });
}

export const useSaveConfigDraft = () =>
  useWrite(
    (v: { config: AppConfigBody; baseVersion: number }) => appConfigApi.saveDraft(v.config, v.baseVersion),
    false,
  );

export const usePublishConfig = () =>
  useWrite((v: { baseVersion: number; note?: string }) => appConfigApi.publish(v.baseVersion, v.note), true);

export const useRollbackConfig = () =>
  useWrite(
    (v: { version: number; baseVersion: number; note?: string }) =>
      appConfigApi.rollback(v.version, v.baseVersion, v.note),
    true,
  );
