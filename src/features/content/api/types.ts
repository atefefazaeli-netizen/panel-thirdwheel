// DTOs for ADMIN_API.md › Content (shapes follow the backend content module views).

export type ContentPillar = 'quiz' | 'play' | 'do';
export type DraftState = 'editing' | 'in_review' | 'changes_requested';
export type ContentListState = 'live' | DraftState | 'retired';
export type DraftSource = 'panel' | 'n8n';

export const PILLARS: readonly ContentPillar[] = ['quiz', 'play', 'do'];
export const LIST_STATES: readonly ContentListState[] = [
  'live',
  'editing',
  'in_review',
  'changes_requested',
  'retired',
];
export const WHERES = ['anywhere', 'home', 'out', 'outside', 'apart'] as const;
export type Where = (typeof WHERES)[number];
export const ONLY_VALUES = ['spicy', 'kids', 'ld', 'opt-in'] as const;

export const KINDS_BY_PILLAR: Record<ContentPillar, readonly string[]> = {
  quiz: ['type-quiz', 'quiz-turn', 'quiz-deck', 'quiz-solo'],
  play: ['type-play', 'play-live', 'play-league', 'play-shelf'],
  do: ['do-home', 'do-outside', 'do-book', 'type-do'],
};

/** The Explore row (`CatalogEntry`). `id`, `kind`, `pillar` and `code` inside it are set by the server. */
export interface CatalogFields {
  title: string;
  meta?: string;
  emoji?: string;
  where?: string[];
  category?: string;
  sub?: string;
  minutes?: number;
  duration?: string;
  vibes?: string[];
  play?: string;
  only?: string;
  price?: number | null;
  type?: string;
  sensitive?: boolean;
  scoring?: string;
  screen?: string;
  code?: string;
  [key: string]: unknown;
}

/** A workbook card (`WbCard` without `n`; array order is the card order). */
export interface ContentCard {
  text: string;
  intro?: string;
  secondary?: 'Everyday' | 'Sensitive';
  followUp?: string;
  softCheck?: boolean;
  early?: boolean;
  pick?: string[];
  label?: string;
  scale?: { min: number; max: number; low: string; high: string };
  item?: { title: string; line?: string };
  items?: string[];
  list?: string[];
  [key: string]: unknown;
}

/** A Do step (`DoPlanStep` in the app's doSteps.ts). */
export interface DoPlanStep {
  title: string;
  body: string;
  minutes?: number;
  swapAt?: number;
  lead?: string;
  swap?: { verb: string; verbIng: string; object: string };
  [key: string]: unknown;
}

export interface ContentBody {
  intro?: string;
  cards?: ContentCard[];
  steps?: DoPlanStep[];
  deck?: Record<string, unknown> & { type?: string };
  howYouPlay?: string;
  howItPlays?: string;
  how?: string;
  safety?: string;
  need?: string[];
  followUp?: string;
  [key: string]: unknown;
}

export interface ContentSnapshot {
  catalog: CatalogFields;
  body: ContentBody;
}

export interface ContentDraft {
  snapshot: ContentSnapshot;
  state: DraftState;
  note: string | null;
  by: string;
  byEmail: string | null;
  at: string;
  source: DraftSource;
}

/** One part no clinician has reviewed in this system ("steps", "deck", "cards.options"…). */
export interface ReviewNeed {
  part: string;
  reason: string;
}

/** Seeded items: where the text comes from (ADMIN_API.md › Content › Provenance). */
export interface ContentProvenance {
  source: 'release1-bundle';
  cleared: string[];
  flagged: ReviewNeed[];
  needsReview: ReviewNeed[];
  notes: string[];
  clearedBy: { by: string; byEmail: string | null; at: string; version: number; via: string } | null;
}

export interface HeldEntry {
  type: string;
  world: string;
  item: string;
  why: string;
}

export interface HeldMatch {
  reasons: { field: 'title' | 'category' | 'world' | 'sub'; value: string; held: HeldEntry }[];
}

export interface ContentItem {
  id: string;
  code: string | null;
  pillar: ContentPillar;
  kind: string;
  live: ContentSnapshot | null;
  liveVersion: number;
  livePublishedAt: string | null;
  liveApprovedBy: string | null;
  liveApprovedByEmail: string | null;
  /** Live is the seeded bundle (approver id `workbook`): not a sign-off in this system. */
  liveSeeded: boolean;
  liveApprovalLabel: string | null;
  draft: ContentDraft | null;
  retired: boolean;
  /** Send back as `expectedRev` on every write (409 CONTENT_CONFLICT when the item moved). */
  rev: number;
  provenance: ContentProvenance | null;
  needsReview: boolean;
  heldMatch: HeldMatch | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentSummary {
  id: string;
  code: string | null;
  pillar: ContentPillar;
  kind: string;
  title: string;
  category: string | null;
  type: string | null;
  only: string | null;
  liveVersion: number;
  draftState: DraftState | null;
  retired: boolean;
  rev: number;
  needsReview: boolean;
  held: boolean;
  updatedAt: string;
}

export interface ContentFacets {
  categories: string[];
  types: string[];
  kinds: string[];
}

export type VersionAction = 'published' | 'rolled_back' | 'seeded';

export interface ContentVersion {
  version: number;
  publishedAt: string;
  approvedBy: string;
  approvedByEmail: string | null;
  action: VersionAction;
  note: string | null;
  by: string;
  byEmail: string | null;
  from: number | null;
  /** The seeded bundle (approvedBy `workbook`): not a clinician sign-off in this system. */
  seeded: boolean;
  approvalLabel: string | null;
}

export interface ContentVersionDetail extends ContentVersion {
  snapshot: ContentSnapshot;
}

export type ChangeAction =
  | 'seeded'
  | 'created'
  | 'draft_saved'
  | 'draft_discarded'
  | 'submitted'
  | 'approved'
  | 'changes_requested'
  | 'unpublished'
  | 'restored'
  | 'rolled_back'
  | 'imported';

export interface ContentChange {
  action: ChangeAction;
  by: string;
  byEmail: string | null;
  note: string | null;
  at: string;
  meta: {
    version?: number;
    summary?: string[];
    state?: DraftState;
    selfApproved?: boolean;
    acknowledgedHeld?: boolean;
    clearedReview?: string[];
    restoredReview?: string[];
  } | null;
}

export interface ContentImportItem {
  id: string;
  code?: string | null;
  pillar: ContentPillar;
  kind: string;
  catalog: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export interface ContentImportItemResult {
  id: string;
  status: 'created' | 'updated' | 'rejected';
  reason?: string;
  details?: string[];
  /** Updates: the draft state the import replaces (null = no draft). */
  replacedDraft?: DraftState | null;
  /** Held-list matches. */
  held?: string[];
}

export interface ContentImportResult {
  created: string[];
  updated: string[];
  rejected: { id: string; reason: string }[];
  results: ContentImportItemResult[];
  dryRun: boolean;
}

export interface ContentListQuery {
  pillar?: ContentPillar;
  q?: string;
  state?: ContentListState;
  category?: string;
  type?: string;
  only?: string;
  needsReview?: 'true' | 'false';
  page?: number;
  limit?: number;
}

export interface CreateContentInput {
  id: string;
  code?: string | null;
  pillar: ContentPillar;
  kind: string;
  snapshot: ContentSnapshot;
}
