import { api, normalizePage, type Paginated } from '@/lib/api';
import type { AppConfigAdmin, AppConfigBody, ConfigVersion } from './types';

// `baseVersion` is always `draft.version` from the view the page loaded: a stale one is
// 409 CONFIG_CONFLICT. Every write answers the same view as GET admin/app-config.
export const appConfigApi = {
  get: () => api.get<AppConfigAdmin>('admin/app-config'),
  /** The server merges: omitted fields keep the draft's value. The panel sends the whole form. */
  saveDraft: (config: AppConfigBody, baseVersion: number) =>
    api.put<AppConfigAdmin>('admin/app-config/draft', { config, baseVersion }),
  publish: (baseVersion: number, note?: string) =>
    api.post<AppConfigAdmin>('admin/app-config/publish', { baseVersion, ...(note ? { note } : {}) }),
  versions: async (page = 1): Promise<Paginated<ConfigVersion>> =>
    normalizePage(await api.get('admin/app-config/versions', { query: { page } })),
  rollback: (version: number, baseVersion: number, note?: string) =>
    api.post<AppConfigAdmin>('admin/app-config/rollback', { version, baseVersion, ...(note ? { note } : {}) }),
};
