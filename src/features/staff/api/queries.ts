import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { staffApi } from './staff-api';
import type { CreateStaffInput, RoleInput } from './types';

export const staffKeys = {
  all: ['staff'] as const,
  list: () => [...staffKeys.all, 'list'] as const,
  sessions: (id: string) => [...staffKeys.all, 'sessions', id] as const,
  roles: () => [...staffKeys.all, 'roles'] as const,
  permissions: () => [...staffKeys.all, 'permissions'] as const,
};

export const useStaffList = () => useQuery({ queryKey: staffKeys.list(), queryFn: staffApi.list });
export const useRoles = () => useQuery({ queryKey: staffKeys.roles(), queryFn: staffApi.roles });
export const usePermissionCatalog = () =>
  useQuery({ queryKey: staffKeys.permissions(), queryFn: staffApi.permissions, staleTime: Infinity });
export const useStaffSessions = (id: string | null) =>
  useQuery({ queryKey: staffKeys.sessions(id ?? ''), queryFn: () => staffApi.sessions(id!), enabled: !!id });

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: staffKeys.all });
}

/** Every staff write; the list, roles (holders) and sessions follow. Errors render inline. */
export function useStaffActions() {
  const invalidate = useInvalidate();
  const opts = { meta: { silent: true }, onSuccess: () => invalidate() };
  return {
    create: useMutation({ mutationFn: (v: CreateStaffInput) => staffApi.create(v), ...opts }),
    update: useMutation({
      mutationFn: (v: { id: string; displayName?: string; roles?: string[] }) =>
        staffApi.update(v.id, { displayName: v.displayName, roles: v.roles }),
      ...opts,
    }),
    disable: useMutation({ mutationFn: (id: string) => staffApi.disable(id), ...opts }),
    enable: useMutation({ mutationFn: (id: string) => staffApi.enable(id), ...opts }),
    resetPassword: useMutation({ mutationFn: (id: string) => staffApi.resetPassword(id), ...opts }),
    resetMfa: useMutation({ mutationFn: (id: string) => staffApi.resetMfa(id), ...opts }),
    revokeSessions: useMutation({ mutationFn: (id: string) => staffApi.revokeSessions(id), ...opts }),
  };
}

export function useRoleActions() {
  const invalidate = useInvalidate();
  const opts = { meta: { silent: true }, onSuccess: () => invalidate() };
  return {
    create: useMutation({ mutationFn: (v: RoleInput) => staffApi.createRole(v), ...opts }),
    update: useMutation({
      mutationFn: ({ key, ...patch }: RoleInput) => staffApi.updateRole(key, patch),
      ...opts,
    }),
    remove: useMutation({ mutationFn: (key: string) => staffApi.deleteRole(key), ...opts }),
  };
}
