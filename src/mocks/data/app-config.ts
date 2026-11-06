// Mock Remote Config, as built on feature/support-remote-config (STAFF_API.md §6): the published
// versions (version 1 is the migration's seed: the default), the draft with its own version (the
// `baseVersion` token) and the server's feature list. Development and tests only.
import type { AppConfigBody, ConfigVersion, FeatureInfo } from '@/features/app-config/api/types';
import { daysAgo } from '../utils';
import { staffId } from './staff';

/** The backend's FEATURES (modules/app-config/domain/app-config.ts), word for word. */
export const MOCK_FEATURES: FeatureInfo[] = [
  {
    key: 'thirdEar',
    label: 'Third Ear',
    description:
      'The AI companion: the tab bar pill, follow-up chips in quizzes and games, Ask the stars. Off: hidden, and the API refuses Third Ear messages and cards.',
  },
  {
    key: 'spicy',
    label: 'Spicy',
    description:
      'Spicy decks and games in Explore, Spicy suggestions in Third Ear, explicit lip-sync songs and the Spicy row in Preferences. Off: hidden for everyone; nobody’s own switch changes.',
  },
  {
    key: 'calendar',
    label: 'Calendar',
    description:
      'Google Calendar connect: the Plans banner and Settings › Calendar. Off: hidden for people not connected; connected people can still disconnect.',
  },
];

export interface AppConfigDraft {
  config: AppConfigBody;
  /** The concurrency token: every draft save, publish and rollback bumps it. */
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
}

export interface AppConfigState {
  versions: ConfigVersion[];
  /** null until someone saves a draft: the draft is then the live config at version 0. */
  draft: AppConfigDraft | null;
}

/** Every feature on, no maintenance, no version limits. */
export const defaultConfig = (): AppConfigBody => ({
  features: Object.fromEntries(MOCK_FEATURES.map((f) => [f.key, true])),
  maintenance: { enabled: false, message: null },
  minVersion: null,
  recommendedVersion: null,
});

export function seedAppConfig(): AppConfigState {
  const owner = `staff:${staffId('owner')}`;
  return {
    versions: [
      {
        version: 1,
        config: defaultConfig(),
        kind: 'seed',
        note: null,
        rolledBackFrom: null,
        publishedBy: 'system',
        publishedByName: null,
        publishedAt: daysAgo(20),
      },
      {
        version: 2,
        config: { ...defaultConfig(), recommendedVersion: '1.3.0' },
        kind: 'publish',
        note: 'Suggest 1.3.0 (Explore fixes).',
        rolledBackFrom: null,
        publishedBy: owner,
        publishedByName: 'Rania Aziz',
        publishedAt: daysAgo(6),
      },
    ],
    draft: null,
  };
}
