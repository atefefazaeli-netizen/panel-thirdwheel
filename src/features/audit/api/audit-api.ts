import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, normalizePage, type Paginated } from '@/lib/api';

/** ADMIN_API.md › Audit. `meta` holds small, non-sensitive details, never message text. */
export interface AuditEntry {
  id: string;
  actor: string;
  actorEmail: string | null;
  action: string;
  target: string;
  meta: Record<string, unknown> | null;
  at: string;
}

export interface AuditQuery {
  actor?: string;
  action?: string;
  target?: string;
  page?: number;
  limit?: number;
}

export const auditApi = {
  list: async (q: AuditQuery): Promise<Paginated<AuditEntry>> =>
    normalizePage(await api.get('admin/audit', { query: { ...q } })),
};

export const auditKeys = { all: ['audit'] as const, list: (q: AuditQuery) => [...auditKeys.all, q] as const };

export const useAudit = (q: AuditQuery) =>
  useQuery({ queryKey: auditKeys.list(q), queryFn: () => auditApi.list(q), placeholderData: keepPreviousData });
