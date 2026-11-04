import { api, normalizePage, type Paginated } from '@/lib/api';
import type { AiRuntimeSettings, AiSettingsHistoryEntry, AiSettingsInput, AiSettingsView, AiTestResult } from './types';

export const aiApi = {
  settings: () => api.get<AiSettingsView>('admin/ai/settings'),
  /** `baseVersion`: the version the form was loaded from; a newer save on the server answers 409 SETTINGS_CONFLICT. */
  save: (input: AiSettingsInput & { note?: string; baseVersion: number }) =>
    api.put<AiRuntimeSettings>('admin/ai/settings', input),
  history: async (page = 1, limit = 10): Promise<Paginated<AiSettingsHistoryEntry>> =>
    normalizePage(await api.get('admin/ai/settings/history', { query: { page, limit } })),
  rollback: (version: number, baseVersion: number) =>
    api.post<AiRuntimeSettings>('admin/ai/settings/rollback', { version, baseVersion }),
  test: (body: { mode: string; text: string; draft?: AiSettingsInput }) =>
    api.post<AiTestResult>('admin/ai/test', body, { timeoutMs: 60_000 }),
};
