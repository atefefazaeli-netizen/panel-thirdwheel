import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { safetyApi } from './safety-api';
import type { SafetyFlag, SafetyFlagQuery } from './types';

export const safetyKeys = {
  all: ['safety'] as const,
  lists: () => [...safetyKeys.all, 'list'] as const,
  list: (q: SafetyFlagQuery) => [...safetyKeys.lists(), q] as const,
  flag: (id: string) => [...safetyKeys.all, 'flag', id] as const,
  summary: () => [...safetyKeys.all, 'summary'] as const,
};

export const useSafetyFlags = (q: SafetyFlagQuery) =>
  useQuery({ queryKey: safetyKeys.list(q), queryFn: () => safetyApi.list(q), placeholderData: keepPreviousData });
export const useSafetyFlag = (id: string | null) =>
  useQuery({ queryKey: safetyKeys.flag(id ?? ''), queryFn: () => safetyApi.get(id!), enabled: !!id });
export const useSafetySummary = () => useQuery({ queryKey: safetyKeys.summary(), queryFn: safetyApi.summary });

function useFlagWrite<V>(fn: (v: V) => Promise<SafetyFlag>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (flag) => {
      qc.setQueryData(safetyKeys.flag(flag.id), flag);
      void qc.invalidateQueries({ queryKey: safetyKeys.lists() });
      void qc.invalidateQueries({ queryKey: safetyKeys.summary() });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export const useReviewFlag = () => useFlagWrite((v: { id: string; note?: string }) => safetyApi.review(v.id, v.note));
export const useAddFlagNote = () => useFlagWrite((v: { id: string; text: string }) => safetyApi.addNote(v.id, v.text));
export const useEscalateFlag = () =>
  useFlagWrite((v: { id: string; note?: string }) => safetyApi.escalate(v.id, v.note));
