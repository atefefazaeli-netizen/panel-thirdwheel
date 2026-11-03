// The content workflow for the mock API. A port of the backend's pure domain
// (backend/apps/api/src/modules/content/domain/content.ts) so the mock enforces the same rules,
// errors and change log as the real API. Dates are ISO strings here.
import type {
  ChangeAction,
  ContentChange,
  ContentItem,
  ContentPillar,
  ContentSnapshot,
  ContentVersionDetail,
  DraftSource,
  DraftState,
} from '@/features/content/api/types';

export const CONTENT_KINDS = [
  'quiz-turn',
  'quiz-deck',
  'quiz-solo',
  'play-league',
  'play-live',
  'play-shelf',
  'type-quiz',
  'type-play',
  'type-do',
  'do-home',
  'do-book',
  'do-outside',
] as const;
const PILLARS: ContentPillar[] = ['quiz', 'play', 'do'];
const WHERES = ['anywhere', 'home', 'out', 'outside', 'apart'];
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
export const CODE_PATTERN = /^[A-Z][A-Z0-9-]{0,19}$/;
const LIMITS = {
  title: 120,
  text: 1000,
  minutes: 7 * 24 * 60,
  cards: 100,
  steps: 30,
  list: 30,
  depth: 8,
  bytes: 256 * 1024,
} as const;

export interface Actor {
  id: string;
  email: string | null;
  roles: readonly string[];
}

/** Stored item: the API view plus the optimistic-concurrency fields the server keeps. */
export interface StoredItem extends ContentItem {
  liveRevision: number;
}

export interface StoredVersion extends ContentVersionDetail {
  itemId: string;
}

export interface StoredChange extends ContentChange {
  itemId: string;
}

export interface Transition {
  item: StoredItem;
  change: ContentChange;
  version?: StoredVersion;
  publishes?: 'published' | 'rolled_back' | 'unpublished' | 'restored';
}

export class ContentRuleError extends Error {
  readonly code: string;
  readonly status: 400 | 403 | 404 | 409;
  readonly details?: string[];
  constructor(code: string, message: string, status: 400 | 403 | 404 | 409, details?: string[]) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const fail = (code: string, message: string, status: 400 | 403 | 404 | 409, details?: string[]): never => {
  throw new ContentRuleError(code, message, status, details);
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const textOk = (v: unknown, max: number = LIMITS.text) =>
  typeof v === 'string' && v.trim().length >= 1 && v.length <= max;

function checkStrings(v: unknown, at: string, out: string[], depth = 0): void {
  if (out.length >= 20) return;
  if (depth > LIMITS.depth) {
    out.push(`${at}: nested too deep`);
    return;
  }
  if (typeof v === 'string') {
    if (v.length > LIMITS.text) out.push(`${at}: at most ${LIMITS.text} characters`);
  } else if (Array.isArray(v)) {
    if (v.length > LIMITS.cards) out.push(`${at}: at most ${LIMITS.cards} entries`);
    v.forEach((x, i) => checkStrings(x, `${at}[${i}]`, out, depth + 1));
  } else if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) checkStrings(x, `${at}.${k}`, out, depth + 1);
  } else if (v !== null && typeof v !== 'number' && typeof v !== 'boolean') {
    out.push(`${at}: not JSON`);
  }
}

export function validateSnapshot(snapshot: unknown, kind: string): string[] {
  const out: string[] = [];
  if (!isObj(snapshot)) return ['snapshot: must be an object with catalog and body'];
  const json = JSON.stringify(snapshot);
  if (new TextEncoder().encode(json).length > LIMITS.bytes) return ['snapshot: at most 256 KB'];
  const { catalog, body } = snapshot;
  if (!isObj(catalog)) out.push('catalog: must be an object');
  if (!isObj(body)) out.push('body: must be an object');
  if (out.length) return out;
  const c = catalog as Record<string, unknown>;
  const b = body as Record<string, unknown>;
  if (!textOk(c.title, LIMITS.title)) out.push(`catalog.title: 1 to ${LIMITS.title} characters`);
  if (c.meta !== undefined && (typeof c.meta !== 'string' || c.meta.length > 200))
    out.push('catalog.meta: text, at most 200 characters');
  if (
    c.where !== undefined &&
    (!Array.isArray(c.where) || !c.where.length || c.where.some((w) => !WHERES.includes(w as string)))
  ) {
    out.push(`catalog.where: one or more of ${WHERES.join(', ')}`);
  }
  if (
    c.minutes !== undefined &&
    (typeof c.minutes !== 'number' || !Number.isInteger(c.minutes) || c.minutes < 1 || c.minutes > LIMITS.minutes)
  ) {
    out.push(`catalog.minutes: a whole number from 1 to ${LIMITS.minutes}`);
  }
  if (c.category !== undefined && !textOk(c.category, 40)) out.push('catalog.category: 1 to 40 characters');
  checkStrings(c, 'catalog', out);
  if (b.cards !== undefined) {
    if (!Array.isArray(b.cards) || b.cards.length > LIMITS.cards)
      out.push(`body.cards: a list of at most ${LIMITS.cards} cards`);
    else
      b.cards.forEach(
        (card, i) =>
          !(isObj(card) && textOk(card.text)) && out.push(`body.cards[${i}].text: 1 to ${LIMITS.text} characters`),
      );
  }
  if (b.steps !== undefined) {
    if (!Array.isArray(b.steps) || b.steps.length > LIMITS.steps)
      out.push(`body.steps: a list of at most ${LIMITS.steps} steps`);
    else
      b.steps.forEach((s, i) => {
        if (!isObj(s) || !textOk(s.title, 200)) out.push(`body.steps[${i}].title: 1 to 200 characters`);
        else if (!textOk(s.body)) out.push(`body.steps[${i}].body: 1 to ${LIMITS.text} characters`);
      });
  }
  if (b.deck !== undefined && (!isObj(b.deck) || typeof b.deck.type !== 'string'))
    out.push('body.deck: an object with a `type`');
  if (
    b.need !== undefined &&
    (!Array.isArray(b.need) || b.need.length > LIMITS.list || b.need.some((x) => !textOk(x, 200)))
  )
    out.push('body.need: a list of short lines');
  for (const k of ['intro', 'howYouPlay', 'howItPlays', 'how', 'safety', 'followUp']) {
    if (b[k] !== undefined && b[k] !== null && typeof b[k] !== 'string') out.push(`body.${k}: text`);
  }
  if (kind.startsWith('type-') && !isObj(b.deck)) out.push('body.deck: required for a type item');
  if ((kind === 'quiz-turn' || kind === 'quiz-deck') && (!Array.isArray(b.cards) || !b.cards.length))
    out.push('body.cards: at least one card');
  checkStrings(b, 'body', out);
  return out.slice(0, 20);
}

export function checkedSnapshot(
  item: Pick<StoredItem, 'id' | 'code' | 'pillar' | 'kind'>,
  snapshot: unknown,
): ContentSnapshot {
  const problems = validateSnapshot(snapshot, item.kind);
  if (problems.length) fail('INVALID_CONTENT', 'This content is not valid.', 400, problems);
  const s = snapshot as ContentSnapshot;
  const catalog: ContentSnapshot['catalog'] = { ...s.catalog, id: item.id, kind: item.kind, pillar: item.pillar };
  if (item.code) catalog.code = item.code;
  else delete catalog.code;
  return { catalog, body: { ...s.body } };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function listDiff(name: string, a: unknown, b: unknown): string | null {
  const x = Array.isArray(a) ? a : [];
  const y = Array.isArray(b) ? b : [];
  if (same(x, y)) return null;
  let changed = 0;
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (!same(x[i], y[i])) changed++;
  const parts = [
    changed && `${changed} changed`,
    y.length > x.length && `${y.length - x.length} added`,
    x.length > y.length && `${x.length - y.length} removed`,
  ].filter(Boolean);
  return `${name}: ${parts.join(', ') || 'reordered'}`;
}

export function diffSummary(before: ContentSnapshot | null, after: ContentSnapshot): string[] {
  if (!before) return ['new'];
  const out: string[] = [];
  const keys = (a: object, b: object) => [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys(before.catalog, after.catalog))
    if (!same(before.catalog[k], after.catalog[k])) out.push(`catalog.${k}`);
  for (const k of keys(before.body, after.body)) {
    if (k === 'cards' || k === 'steps') {
      const d = listDiff(`body.${k}`, before.body[k], after.body[k]);
      if (d) out.push(d);
    } else if (!same(before.body[k], after.body[k])) out.push(`body.${k}`);
  }
  return out;
}

const isClinician = (a: Actor) => a.roles.includes('clinician');
const touch = (item: StoredItem, now: string, patch: Partial<StoredItem>): StoredItem => ({
  ...item,
  ...patch,
  updatedAt: now,
});
const entry = (
  action: ChangeAction,
  actor: Actor,
  now: string,
  note: string | null = null,
  meta: ContentChange['meta'] = null,
): ContentChange => ({
  action,
  by: actor.id,
  byEmail: actor.email,
  note,
  at: now,
  meta,
});
const cleanNote = (note: string | null | undefined) => (note && note.trim() ? note.trim() : null);

export function createItem(
  input: { id: string; code?: string | null; pillar: ContentPillar; kind: string; snapshot: unknown },
  actor: Actor,
  now: string,
  source: DraftSource = 'panel',
  state: DraftState = 'editing',
  note: string | null = null,
): Transition {
  if (!ID_PATTERN.test(input.id ?? ''))
    fail('INVALID_CONTENT', 'This content is not valid.', 400, [
      'id: lowercase letters, digits and dashes, at most 80',
    ]);
  if (input.code != null && !CODE_PATTERN.test(input.code))
    fail('INVALID_CONTENT', 'This content is not valid.', 400, ['code: like Q-1-01']);
  if (!PILLARS.includes(input.pillar))
    fail('INVALID_CONTENT', 'This content is not valid.', 400, ['pillar: quiz, play or do']);
  if (!(CONTENT_KINDS as readonly string[]).includes(input.kind))
    fail('INVALID_CONTENT', 'This content is not valid.', 400, [`kind: one of ${CONTENT_KINDS.join(', ')}`]);
  const shell: StoredItem = {
    id: input.id,
    code: input.code ?? null,
    pillar: input.pillar,
    kind: input.kind,
    live: null,
    liveVersion: 0,
    livePublishedAt: null,
    liveApprovedBy: null,
    liveApprovedByEmail: null,
    liveRevision: 0,
    draft: null,
    retired: false,
    createdAt: now,
    updatedAt: now,
  };
  const snapshot = checkedSnapshot(shell, input.snapshot);
  return {
    item: {
      ...shell,
      draft: { snapshot, state, note: cleanNote(note), by: actor.id, byEmail: actor.email, at: now, source },
    },
    change: entry(source === 'n8n' || state === 'in_review' ? 'imported' : 'created', actor, now, cleanNote(note), {
      summary: ['new'],
      state,
    }),
  };
}

export function saveDraft(item: StoredItem, snapshot: unknown, actor: Actor, now: string): Transition {
  const next = checkedSnapshot(item, snapshot);
  const before = item.draft?.snapshot ?? item.live;
  return {
    item: touch(item, now, {
      draft: {
        snapshot: next,
        state: 'editing',
        note: item.draft?.note ?? null,
        by: actor.id,
        byEmail: actor.email,
        at: now,
        source: 'panel',
      },
    }),
    change: entry('draft_saved', actor, now, null, { summary: diffSummary(before, next), state: 'editing' }),
  };
}

export function discardDraft(item: StoredItem, actor: Actor, now: string): Transition {
  if (!item.draft) fail('NO_DRAFT', 'There is no draft.', 409);
  return { item: touch(item, now, { draft: null }), change: entry('draft_discarded', actor, now) };
}

export function submitDraft(item: StoredItem, note: string | null | undefined, actor: Actor, now: string): Transition {
  const d = item.draft ?? fail('NO_DRAFT', 'There is no draft to submit.', 409);
  if (d.state === 'in_review') fail('ALREADY_IN_REVIEW', 'This draft is already in review.', 409);
  const n = cleanNote(note);
  return {
    item: touch(item, now, { draft: { ...d, state: 'in_review', note: n ?? d.note, at: now } }),
    change: entry('submitted', actor, now, n, { state: 'in_review' }),
  };
}

export function approveDraft(item: StoredItem, note: string | null | undefined, actor: Actor, now: string): Transition {
  if (!isClinician(actor)) fail('CLINICIAN_ONLY', 'Only a clinician can approve content.', 403);
  const d = item.draft;
  if (!d || d.state !== 'in_review') return fail('NOT_IN_REVIEW', 'Only a draft in review can be approved.', 409);
  const version = item.liveVersion + 1;
  const n = cleanNote(note);
  return {
    item: touch(item, now, {
      live: d.snapshot,
      liveVersion: version,
      livePublishedAt: now,
      liveApprovedBy: actor.id,
      liveApprovedByEmail: actor.email,
      draft: null,
    }),
    change: entry('approved', actor, now, n, { version, summary: diffSummary(item.live, d.snapshot) }),
    version: {
      itemId: item.id,
      version,
      snapshot: d.snapshot,
      publishedAt: now,
      approvedBy: actor.id,
      approvedByEmail: actor.email,
      action: 'published',
      note: n,
      by: actor.id,
      byEmail: actor.email,
      from: null,
    },
    publishes: 'published',
  };
}

export function requestChanges(
  item: StoredItem,
  note: string | null | undefined,
  actor: Actor,
  now: string,
): Transition {
  if (!isClinician(actor)) fail('CLINICIAN_ONLY', 'Only a clinician can request changes.', 403);
  const d = item.draft;
  if (!d || d.state !== 'in_review') return fail('NOT_IN_REVIEW', 'Only a draft in review can be sent back.', 409);
  const n = cleanNote(note) ?? fail('NOTE_REQUIRED', 'Say what needs to change.', 400);
  return {
    item: touch(item, now, { draft: { ...d, state: 'changes_requested', note: n, at: now } }),
    change: entry('changes_requested', actor, now, n, { state: 'changes_requested' }),
  };
}

export function unpublishItem(item: StoredItem, actor: Actor, now: string): Transition {
  if (item.retired) fail('ALREADY_RETIRED', 'This item is already unpublished.', 409);
  return {
    item: touch(item, now, { retired: true }),
    change: entry('unpublished', actor, now, null, { version: item.liveVersion }),
    publishes: 'unpublished',
  };
}

export function restoreItem(item: StoredItem, actor: Actor, now: string): Transition {
  if (!item.retired) fail('NOT_RETIRED', 'This item is not unpublished.', 409);
  return {
    item: touch(item, now, { retired: false }),
    change: entry('restored', actor, now, null, { version: item.liveVersion }),
    publishes: 'restored',
  };
}

export function rollbackTo(
  item: StoredItem,
  target: StoredVersion,
  note: string | null | undefined,
  actor: Actor,
  now: string,
): Transition {
  if (target.itemId !== item.id) fail('VERSION_NOT_FOUND', 'No such version.', 404);
  if (target.version === item.liveVersion) fail('ALREADY_LIVE', 'That version is live now.', 409);
  const version = item.liveVersion + 1;
  const n = cleanNote(note);
  return {
    item: touch(item, now, {
      live: target.snapshot,
      liveVersion: version,
      livePublishedAt: now,
      liveApprovedBy: target.approvedBy,
      liveApprovedByEmail: target.approvedByEmail,
    }),
    change: entry('rolled_back', actor, now, n, {
      version,
      summary: item.live ? diffSummary(item.live, target.snapshot) : ['new'],
    }),
    version: {
      ...target,
      version,
      publishedAt: now,
      action: 'rolled_back',
      note: n,
      by: actor.id,
      byEmail: actor.email,
      from: target.version,
    },
    publishes: 'rolled_back',
  };
}

export function importDraft(
  item: StoredItem | null,
  input: { id: string; code?: string | null; pillar: ContentPillar; kind: string; catalog: unknown; body?: unknown },
  note: string | null | undefined,
  actor: Actor,
  now: string,
  source: DraftSource,
): Transition {
  const snapshot = { catalog: input.catalog, body: input.body ?? {} };
  if (!item) return createItem({ ...input, snapshot }, actor, now, source, 'in_review', cleanNote(note));
  if (item.pillar !== input.pillar || item.kind !== input.kind)
    fail('PILLAR_MISMATCH', `${item.id} is a ${item.pillar} ${item.kind}.`, 409);
  const next = checkedSnapshot(item, snapshot);
  return {
    item: touch(item, now, {
      draft: {
        snapshot: next,
        state: 'in_review',
        note: cleanNote(note),
        by: actor.id,
        byEmail: actor.email,
        at: now,
        source,
      },
    }),
    change: entry('imported', actor, now, cleanNote(note), {
      summary: diffSummary(item.draft?.snapshot ?? item.live, next),
      state: 'in_review',
    }),
  };
}

export const currentSnapshot = (i: Pick<StoredItem, 'draft' | 'live'>) => i.draft?.snapshot ?? i.live;
