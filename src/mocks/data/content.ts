// Mock content: the backend's Release 1 seed (170 items, generated from the app's workbook
// content) as live version 1, plus a few drafts and versions so every workflow state shows up.
import type { ContentSnapshot } from '@/features/content/api/types';
import {
  approveDraft,
  createItem,
  requestChanges,
  rollbackTo,
  saveDraft,
  submitDraft,
  unpublishItem,
  importDraft,
  provenanceFromSeed,
  type Actor,
  type StoredChange,
  type StoredItem,
  type StoredVersion,
  type Transition,
} from '../content-domain';
import { daysAgo } from '../utils';
import { staffId } from './staff';
import seed from './content-seed.json';

/** The seed's editor and clinician (staff accounts `editor` and `reviewer`, data/staff.ts). */
export const LEAD: Actor = {
  id: `staff:${staffId('editor')}`,
  email: null,
  name: 'Huda Karim',
  permissions: ['content.read', 'content.edit', 'content.submit'],
};
export const DOCTOR: Actor = {
  id: `staff:${staffId('reviewer')}`,
  email: null,
  name: 'Dr. Noor Rahman',
  permissions: ['content.read', 'content.approve', 'content.unpublish'],
};
const N8N: Actor = { id: 'apikey:n8n-sheets', email: null, permissions: [] };

type SeedItem = {
  id: string;
  code: string | null;
  pillar: StoredItem['pillar'];
  kind: string;
  catalog: ContentSnapshot['catalog'];
  body: ContentSnapshot['body'];
};

export interface ContentState {
  items: Map<string, StoredItem>;
  versions: StoredVersion[];
  changes: StoredChange[];
  revision: number;
}

const clone = <T>(v: T): T => structuredClone(v);

export function seedContent(): ContentState {
  const seededAt = daysAgo(20);
  const state: ContentState = { items: new Map(), versions: [], changes: [], revision: 0 };
  for (const s of seed as unknown as SeedItem[]) {
    const snapshot: ContentSnapshot = { catalog: s.catalog, body: s.body };
    state.items.set(s.id, {
      id: s.id,
      code: s.code,
      pillar: s.pillar,
      kind: s.kind,
      live: snapshot,
      liveVersion: 1,
      livePublishedAt: seededAt,
      liveApprovedBy: 'workbook',
      liveApprovedByEmail: null,
      liveRevision: 0,
      draft: null,
      retired: false,
      rev: 0,
      provenance: provenanceFromSeed(s.id),
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    state.versions.push({
      itemId: s.id,
      version: 1,
      snapshot,
      publishedAt: seededAt,
      approvedBy: 'workbook',
      approvedByEmail: null,
      action: 'seeded',
      note: null,
      by: 'workbook',
      byEmail: null,
      from: null,
    });
    state.changes.push({
      itemId: s.id,
      action: 'seeded',
      by: 'workbook',
      byEmail: null,
      note: null,
      at: seededAt,
      meta: { version: 1 },
    });
  }

  const apply = (t: Transition) => {
    const prev = state.items.get(t.item.id);
    state.items.set(t.item.id, prev ? { ...t.item, rev: prev.rev + 1 } : t.item);
    state.changes.push({ ...t.change, itemId: t.item.id });
    if (t.version) state.versions.push(t.version);
    if (t.publishes) state.revision += 1;
  };
  const get = (id: string) => state.items.get(id)!;
  const edit = (id: string, fn: (s: ContentSnapshot) => void): ContentSnapshot => {
    const s = clone(get(id).draft?.snapshot ?? get(id).live!);
    fn(s);
    return s;
  };
  const deckQuestions = (s: ContentSnapshot) => (s.body.deck as { questions: { q: string }[] }).questions;

  // My perfect day (Q-2-01): approved once by the clinician, now a new draft waits in review.
  apply(
    saveDraft(
      get('my-perfect-day'),
      edit('my-perfect-day', (s) => (s.catalog.meta = 'Under 5 min · Two phones · Getting to know you')),
      LEAD,
      daysAgo(6),
    ),
  );
  apply(submitDraft(get('my-perfect-day'), 'Clearer meta line', LEAD, daysAgo(6)));
  apply(approveDraft(get('my-perfect-day'), 'Fine to ship.', DOCTOR, daysAgo(5)));
  apply(
    saveDraft(
      get('my-perfect-day'),
      edit('my-perfect-day', (s) => {
        deckQuestions(s)[2]!.q = 'Describe my ideal weekend. Spare no details!';
        deckQuestions(s).push({ q: 'What would make a rainy Sunday perfect for me?' });
      }),
      LEAD,
      daysAgo(0, 3),
    ),
  );
  apply(submitDraft(get('my-perfect-day'), 'Reworded card 3 and added a rainy-day card.', LEAD, daysAgo(0, 3)));

  // Money date (D-5-01): the clinician sent it back.
  apply(
    saveDraft(
      get('money-date-30-minutes'),
      edit('money-date-30-minutes', (s) => {
        const step = s.body.steps?.[1];
        if (step) step.body = `${step.body} Agree on one savings goal before you finish.`;
      }),
      LEAD,
      daysAgo(2),
    ),
  );
  apply(submitDraft(get('money-date-30-minutes'), null, LEAD, daysAgo(2)));
  apply(
    requestChanges(
      get('money-date-30-minutes'),
      'Step 2 now reads like financial advice. Keep it to questions you ask each other.',
      DOCTOR,
      daysAgo(1, 2),
    ),
  );

  // Lip-sync battle (D-1-01): a draft in progress.
  apply(
    saveDraft(
      get('lip-sync-battle'),
      edit('lip-sync-battle', (s) => {
        s.body.need = [...(s.body.need ?? []), 'A hairbrush microphone'];
      }),
      LEAD,
      daysAgo(0, 1),
    ),
  );

  // Would You Rather: Classic silly (Q-1-03): imported from the clinician sheet by n8n, in review.
  const wyr = get('would-you-rather-classic-silly');
  const wyrSnap = edit('would-you-rather-classic-silly', (s) => {
    s.body.cards = [
      ...(s.body.cards ?? []),
      {
        text: 'Would you rather always know when someone is lying or always get away with lying?',
        secondary: 'Everyday',
      },
    ];
  });
  apply(
    importDraft(
      wyr,
      { id: wyr.id, code: wyr.code, pillar: wyr.pillar, kind: wyr.kind, catalog: wyrSnap.catalog, body: wyrSnap.body },
      'Clinician sheet row 14',
      N8N,
      daysAgo(1),
      'n8n',
    ),
  );

  // Guess My Order (Q-1-02): v2 approved, then rolled back to the workbook version as v3.
  apply(
    saveDraft(
      get('guess-my-order'),
      edit('guess-my-order', (s) => (s.catalog.title = 'Guess My Order: Takeaway night')),
      LEAD,
      daysAgo(9),
    ),
  );
  apply(submitDraft(get('guess-my-order'), null, LEAD, daysAgo(9)));
  apply(approveDraft(get('guess-my-order'), null, DOCTOR, daysAgo(8)));
  apply(
    rollbackTo(
      get('guess-my-order'),
      state.versions.find((v) => v.itemId === 'guess-my-order' && v.version === 1)!,
      'Title did not fit the card.',
      LEAD,
      daysAgo(7),
    ),
  );

  // Phone Stack (G-5-06): unpublished.
  apply(unpublishItem(get('phone-stack'), LEAD, daysAgo(4)));

  // A new Do card made in the panel, never published.
  apply(
    createItem(
      {
        id: 'date-night-jar',
        code: 'D-1-09',
        pillar: 'do',
        kind: 'do-home',
        snapshot: {
          catalog: {
            title: 'Date night jar',
            meta: 'Under 1 hr · At home',
            emoji: '🫙',
            where: ['anywhere', 'home'],
            category: 'nights-in',
            minutes: 40,
            duration: 'Under 1 hr',
            vibes: ['playful'],
            price: null,
          },
          body: {
            intro: 'Fill a jar with ideas, then pull one out tonight.',
            need: ['A jar', 'Paper strips', 'Two pens'],
            steps: [
              { title: 'Write five ideas each', body: 'Small, doable ideas. Fold each strip.', minutes: 10 },
              { title: 'Pull one out', body: 'Take turns pulling until you both say yes to one.' },
            ],
            followUp: 'Which idea surprised you most?',
          },
        },
      },
      LEAD,
      daysAgo(0, 5),
    ),
  );
  return state;
}
