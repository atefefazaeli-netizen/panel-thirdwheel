import { z } from 'zod';
import { optionalBool, optionalEnum, optionalString, pageSearch } from '@/lib/search';

export const contentSearchSchema = z.object({
  pillar: optionalEnum(['quiz', 'play', 'do']),
  q: optionalString,
  state: optionalEnum(['live', 'editing', 'in_review', 'changes_requested', 'retired']),
  category: optionalString,
  type: optionalString,
  only: optionalEnum(['spicy', 'kids', 'ld', 'opt-in']),
  /** "true": only items whose live content needs clinical review (seeded provenance). */
  needsReview: optionalBool,
  ...pageSearch,
});
export type ContentSearch = z.infer<typeof contentSearchSchema>;

/** Review queue filter by provenance source ("panel" = made in the panel, no seed provenance). */
export const REVIEW_SOURCES = ['figma-board', 'release1-bundle', 'panel'] as const;
export const reviewSearchSchema = z.object({
  id: optionalString,
  source: z.enum(REVIEW_SOURCES).optional().catch(undefined),
  ...pageSearch,
});

export const itemSearchSchema = z.object({
  tab: optionalEnum(['catalog', 'cards', 'steps', 'deck', 'history']),
});
