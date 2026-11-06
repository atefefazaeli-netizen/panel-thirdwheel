// Mock Remote Config, as reconciled with v2.0.0 (STAFF_API.md §6): the published
// versions (version 1 is the migration's seed: the default), the draft with its own version (the
// `baseVersion` token) and the server's feature list. Development and tests only.
import type { AppConfigBody, ConfigVersion, FeatureInfo } from '@/features/app-config/api/types';
import { daysAgo } from '../utils';
import { staffId } from './staff';

/** The backend's catalog (libs/common FEATURE_KEYS / FEATURE_DESCRIPTIONS), word for word. */
export const MOCK_FEATURES: FeatureInfo[] = [
  {
    key: 'thirdEar',
    label: 'Third Ear',
    description:
      'Third Ear chat messages, side plans, quiz and game design and every Third Ear card (POST chat/messages, chat/side-plan, chat/design/*, chat/cards/*, chat/pause). Reading or deleting your own chat, chat settings and transcription stay open.',
  },
  {
    key: 'aiCreate',
    label: 'AI quiz and game design',
    description:
      'Third Ear makes a quiz or a game (POST chat/design/quiz, chat/design/game, chat/cards/quiz, chat/cards/game).',
  },
  {
    key: 'voiceInput',
    label: 'Voice input',
    description: 'Mic transcription and voice recordings (POST chat/transcribe, POST recordings).',
  },
  {
    key: 'plusPurchases',
    label: 'Plus purchases',
    description: 'In-app purchase flow (POST subscription/purchase, restore, resubscribe). Store webhooks always run.',
  },
  {
    key: 'venueBooking',
    label: 'Book a place',
    description:
      'Booking links and bookings (GET ideas/:id/booking-link, POST bookings, POST bookings/by-idea/:id/respond). Cancelling stays open.',
  },
  {
    key: 'league',
    label: 'Our league',
    description:
      'League write routes (series, shelf, stakes, phone stack, results, rematch, share). Reading and deleting stay open.',
  },
  {
    key: 'calendarSync',
    label: 'Google Calendar',
    description: 'Connecting Google Calendar (POST calendar/google). Disconnecting stays open.',
  },
  {
    key: 'photoUploads',
    label: 'Photo uploads',
    description:
      'Profile, partner, memory, plan and league shelf/result photo uploads. Viewing and removing photos stay open.',
  },
];

/** The backend's limits (MAINTENANCE_MESSAGE_MAX, APP_CONFIG_NOTE_MAX). */
export const MOCK_LIMITS = { maintenanceMessageMax: 280, noteMax: 300 };

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
  minAppVersion: null,
  recommendedAppVersion: null,
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
        config: { ...defaultConfig(), recommendedAppVersion: '1.3.0' },
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
