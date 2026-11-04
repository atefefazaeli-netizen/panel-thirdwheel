import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api';
import { aiApi } from './ai-api';
import type { AiSettingsInput } from './types';

export const aiKeys = {
  all: ['ai-engine'] as const,
  settings: () => [...aiKeys.all, 'settings'] as const,
  history: (page: number) => [...aiKeys.all, 'history', page] as const,
};

export const useAiSettings = () => useQuery({ queryKey: aiKeys.settings(), queryFn: aiApi.settings });
export const useAiHistory = (page: number) =>
  useQuery({ queryKey: aiKeys.history(page), queryFn: () => aiApi.history(page), placeholderData: keepPreviousData });

function useAiWrite<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: aiKeys.all }) });
}

/** True for the 409 the server sends when someone else saved since this page loaded. */
export const isSettingsConflict = (e: unknown) => isApiError(e) && e.code === 'SETTINGS_CONFLICT';

export const useSaveAiSettings = () =>
  useAiWrite((v: AiSettingsInput & { note?: string; baseVersion: number }) => aiApi.save(v));
export const useRollbackAiSettings = () =>
  useAiWrite((v: { version: number; baseVersion: number }) => aiApi.rollback(v.version, v.baseVersion));
export const useAiTest = () => useMutation({ mutationFn: aiApi.test, meta: { silent: true } });
