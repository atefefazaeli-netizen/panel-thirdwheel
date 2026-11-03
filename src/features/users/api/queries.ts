import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from './users-api';
import type { UserListQuery } from './types';

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (q: UserListQuery) => [...userKeys.lists(), q] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
};

export const useUserList = (q: UserListQuery) =>
  useQuery({ queryKey: userKeys.list(q), queryFn: () => usersApi.list(q), placeholderData: keepPreviousData });

export const useUser = (id: string) => useQuery({ queryKey: userKeys.detail(id), queryFn: () => usersApi.get(id) });

/** Account actions refresh the person, their partner and the lists. */
function useUserAction<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: userKeys.all });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export const useSignOutUser = () => useUserAction((id: string) => usersApi.signOut(id));
export const useSuspendUser = () =>
  useUserAction((v: { id: string; reason: string }) => usersApi.suspend(v.id, v.reason));
export const useUnsuspendUser = () => useUserAction((id: string) => usersApi.unsuspend(id));
export const useSetUserTags = () =>
  useUserAction((v: { id: string; tags: string[] }) => usersApi.setTags(v.id, v.tags));
export const useGrantPlus = () =>
  useUserAction((v: { id: string; days: number; note?: string }) => usersApi.grantPlus(v.id, v.days, v.note));
export const useEndGrant = () => useUserAction((id: string) => usersApi.endGrant(id));
export const useUnlinkUser = () => useUserAction((id: string) => usersApi.unlink(id));
export const useDeleteUser = () =>
  useUserAction((v: { id: string; confirmEmail: string }) => usersApi.remove(v.id, v.confirmEmail));
