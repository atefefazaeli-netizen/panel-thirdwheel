import { api, normalizePage, type Paginated } from '@/lib/api';
import type { AdminAccountRow, AdminSubscriptionView, AdminUserDetail, AdminUserRow, UserListQuery } from './types';

const u = (id: string) => `admin/users/${encodeURIComponent(id)}`;

export const usersApi = {
  list: async (q: UserListQuery): Promise<Paginated<AdminUserRow>> =>
    normalizePage(await api.get('admin/users', { query: { ...q } })),
  get: (id: string) => api.get<AdminUserDetail>(u(id)),
  signOut: (id: string) => api.post<{ ok: true }>(`${u(id)}/sign-out`),
  suspend: (id: string, reason: string) => api.post<AdminAccountRow>(`${u(id)}/suspend`, { reason }),
  unsuspend: (id: string) => api.post<AdminAccountRow>(`${u(id)}/unsuspend`),
  setTags: (id: string, tags: string[]) => api.put<AdminAccountRow>(`${u(id)}/tags`, { tags }),
  grantPlus: (id: string, days: number, note?: string) =>
    api.post<AdminSubscriptionView>(`${u(id)}/plus`, { days, ...(note ? { note } : {}) }),
  endGrant: (id: string) => api.delete<AdminSubscriptionView>(`${u(id)}/plus`),
  unlink: (id: string) => api.post<{ unlinked: boolean }>(`${u(id)}/unlink`),
  remove: (id: string, confirmEmail: string) => api.delete<{ deleted: true }>(u(id), { confirmEmail }),
};
