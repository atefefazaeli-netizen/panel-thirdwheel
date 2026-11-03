import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export const useSaveAiSettings = () => useAiWrite((v: AiSettingsInput & { note?: string }) => aiApi.save(v));
export const useRollbackAiSettings = () => useAiWrite((version: number) => aiApi.rollback(version));
export const useAiTest = () => useMutation({ mutationFn: aiApi.test, meta: { silent: true } });
