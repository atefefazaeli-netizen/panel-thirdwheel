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
  // Every write on an item carries the `rev` the editor last read (409 CONTENT_CONFLICT when it moved).
  saveDraft: (id: string, snapshot: ContentSnapshot, expectedRev: number) =>
    api.put<ContentItem>(`admin/content/${enc(id)}/draft`, { snapshot, expectedRev }),
  discardDraft: (id: string, expectedRev: number) =>
    api.delete<ContentItem>(`admin/content/${enc(id)}/draft`, undefined, { query: { expectedRev } }),
  submit: (id: string, expectedRev: number, note?: string) =>
    api.post<ContentItem>(`admin/content/${enc(id)}/submit`, { expectedRev, ...(note ? { note } : {}) }),
  /** `expectedRev` = the revision of the draft the clinician reviewed. */
  approve: (id: string, expectedRev: number, opts: { note?: string; acknowledgeHeld?: boolean } = {}) =>
    api.post<ContentItem>(`admin/content/${enc(id)}/approve`, {
      expectedRev,
      ...(opts.note ? { note: opts.note } : {}),
      ...(opts.acknowledgeHeld ? { acknowledgeHeld: true } : {}),
    }),
  requestChanges: (id: string, expectedRev: number, note: string) =>
    api.post<ContentItem>(`admin/content/${enc(id)}/request-changes`, { note, expectedRev }),
  unpublish: (id: string, expectedRev: number) =>
    api.post<ContentItem>(`admin/content/${enc(id)}/unpublish`, { expectedRev }),
  restore: (id: string, expectedRev: number) =>
    api.post<ContentItem>(`admin/content/${enc(id)}/restore`, { expectedRev }),
  versions: (id: string) => api.get<ContentVersion[]>(`admin/content/${enc(id)}/versions`),
  version: (id: string, version: number) =>
    api.get<ContentVersionDetail>(`admin/content/${enc(id)}/versions/${version}`),
  rollback: (id: string, version: number, expectedRev: number, note?: string) =>
    api.post<ContentItem>(`admin/content/${enc(id)}/rollback`, { version, expectedRev, ...(note ? { note } : {}) }),
  changes: async (id: string, page = 1, limit = 20): Promise<Paginated<ContentChange>> =>
    normalizePage(await api.get(`admin/content/${enc(id)}/changes`, { query: { page, limit } })),
  import: (items: ContentImportItem[], opts: { note?: string; dryRun?: boolean } = {}) =>
    api.post<ContentImportResult>('admin/content/import', {
      items,
      ...(opts.note ? { note: opts.note } : {}),
      ...(opts.dryRun ? { dryRun: true } : {}),
    }),
};
