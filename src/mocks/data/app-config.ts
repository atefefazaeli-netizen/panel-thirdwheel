// Mock Remote Config (STAFF_API.md §6): the published versions, the draft and the feature list.
// The default published config (migration seed) is everything on, no maintenance, no limits.
import type { AppConfigBody, ConfigVersion, FeatureInfo } from '@/features/app-config/api/types';
import { daysAgo } from '../utils';
import { staffId } from './staff';

/** Features the app can switch off cleanly (the server's list; the panel shows whatever it sends). */
export const MOCK_FEATURES: FeatureInfo[] = [
  { key: 'thirdEar', label: 'Third Ear', description: 'The Third Ear chat tab and its entry points.' },
  { key: 'liveGames', label: 'Live games', description: 'Games played on two phones at once.' },
  { key: 'memories', label: 'Memories', description: 'Adding photos to Memories in Us.' },
  { key: 'league', label: 'Couple league', description: 'The league card and screen in Us.' },
  { key: 'suggestGame', label: 'Suggest a game', description: 'The "Add a game" form in Explore.' },
];

export interface AppConfigState {
  versions: ConfigVersion[];
  draft: AppConfigBody;
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
}

export const allOn = (): AppConfigBody => ({
  features: Object.fromEntries(MOCK_FEATURES.map((f) => [f.key, true])),
  maintenance: { enabled: false, message: null },
  minVersion: null,
  recommendedVersion: null,
});

export function seedAppConfig(): AppConfigState {
  const v1 = allOn();
  const v2: AppConfigBody = { ...allOn(), recommendedVersion: '1.3.0' };
  const owner = `staff:${staffId('owner')}`;
  return {
    versions: [
      {
        version: 1,
        config: v1,
        publishedAt: daysAgo(20),
        publishedBy: null,
        publishedByName: null,
        note: 'Default config (migration seed).',
      },
      {
        version: 2,
        config: v2,
        publishedAt: daysAgo(6),
        publishedBy: owner,
        publishedByName: 'Rania Aziz',
        note: 'Suggest 1.3.0 (Explore fixes).',
      },
    ],
    draft: structuredClone(v2),
    updatedAt: null,
    updatedBy: null,
    updatedByName: null,
  };
}
