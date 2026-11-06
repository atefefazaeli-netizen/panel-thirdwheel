import { api, normalizePage, type Paginated } from '@/lib/api';
import type { AppConfigAdmin, AppConfigBody, ConfigVersion, PublishedConfig } from './types';

export const appConfigApi = {
  get: () => api.get<AppConfigAdmin>('admin/app-config'),
  /** `baseVersion` = the published version the draft was loaded with (409 CONFIG_CONFLICT if stale). */
  saveDraft: (config: AppConfigBody, baseVersion: number) =>
    api.put<AppConfigAdmin>('admin/app-config/draft', { config, baseVersion }),
  publish: (baseVersion: number, note?: string) =>
    api.post<PublishedConfig>('admin/app-config/publish', { baseVersion, ...(note ? { note } : {}) }),
  versions: async (page = 1): Promise<Paginated<ConfigVersion>> =>
    normalizePage(await api.get('admin/app-config/versions', { query: { page } })),
  rollback: (version: number, baseVersion: number, note?: string) =>
    api.post<PublishedConfig>('admin/app-config/rollback', { version, baseVersion, ...(note ? { note } : {}) }),
};
