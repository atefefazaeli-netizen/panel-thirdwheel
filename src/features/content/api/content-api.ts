import { api, normalizePage, type Paginated } from '@/lib/api';
import type {
  ContentChange,
  ContentFacets,
  ContentImportItem,
  ContentImportResult,
  ContentItem,
  ContentListQuery,
  ContentSnapshot,
  ContentSummary,
  ContentVersion,
  ContentVersionDetail,
  CreateContentInput,
} from './types';

const enc = encodeURIComponent;

export const contentApi = {
  list: async (q: ContentListQuery): Promise<Paginated<ContentSummary>> =>
    normalizePage(await api.get('admin/content', { query: { ...q } })),
  facets: () => api.get<ContentFacets>('admin/content/facets'),
  get: (id: string) => api.get<ContentItem>(`admin/content/${enc(id)}`),
  create: (input: CreateContentInput) => api.post<ContentItem>('admin/content', input),
  saveDraft: (id: string, snapshot: ContentSnapshot) =>
    api.put<ContentItem>(`admin/content/${enc(id)}/draft`, { snapshot }),
  discardDraft: (id: string) => api.delete<ContentItem>(`admin/content/${enc(id)}/draft`),
  submit: (id: string, note?: string) => api.post<ContentItem>(`admin/content/${enc(id)}/submit`, note ? { note } : {}),
  approve: (id: string, note?: string) =>
    api.post<ContentItem>(`admin/content/${enc(id)}/approve`, note ? { note } : {}),
  requestChanges: (id: string, note: string) =>
    api.post<ContentItem>(`admin/content/${enc(id)}/request-changes`, { note }),
  unpublish: (id: string) => api.post<ContentItem>(`admin/content/${enc(id)}/unpublish`),
  restore: (id: string) => api.post<ContentItem>(`admin/content/${enc(id)}/restore`),
  versions: (id: string) => api.get<ContentVersion[]>(`admin/content/${enc(id)}/versions`),
  version: (id: string, version: number) =>
    api.get<ContentVersionDetail>(`admin/content/${enc(id)}/versions/${version}`),
  rollback: (id: string, version: number, note?: string) =>
    api.post<ContentItem>(`admin/content/${enc(id)}/rollback`, { version, ...(note ? { note } : {}) }),
  changes: async (id: string, page = 1, limit = 20): Promise<Paginated<ContentChange>> =>
    normalizePage(await api.get(`admin/content/${enc(id)}/changes`, { query: { page, limit } })),
  import: (items: ContentImportItem[], note?: string) =>
    api.post<ContentImportResult>('admin/content/import', { items, ...(note ? { note } : {}) }),
};
