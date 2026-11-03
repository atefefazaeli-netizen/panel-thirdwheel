import { api, normalizePage, type Paginated } from '@/lib/api';
import type { SafetyFlag, SafetyFlagQuery, SafetySummary } from './types';

const f = (id: string) => `admin/safety/flags/${encodeURIComponent(id)}`;

export const safetyApi = {
  list: async (q: SafetyFlagQuery): Promise<Paginated<SafetyFlag>> =>
    normalizePage(await api.get('admin/safety/flags', { query: { ...q } })),
  get: (id: string) => api.get<SafetyFlag>(f(id)),
  review: (id: string, note?: string) => api.post<SafetyFlag>(`${f(id)}/review`, note ? { note } : {}),
  addNote: (id: string, text: string) => api.post<SafetyFlag>(`${f(id)}/notes`, { text }),
  escalate: (id: string, note?: string) => api.post<SafetyFlag>(`${f(id)}/escalate`, note ? { note } : {}),
  summary: () => api.get<SafetySummary>('admin/safety/summary'),
};
