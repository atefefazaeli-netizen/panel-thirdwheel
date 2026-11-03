import { z } from 'zod';
import { optionalEnum, optionalString, pageSearch } from '@/lib/search';

export const contentSearchSchema = z.object({
  pillar: optionalEnum(['quiz', 'play', 'do']),
  q: optionalString,
  state: optionalEnum(['live', 'editing', 'in_review', 'changes_requested', 'retired']),
  category: optionalString,
  type: optionalString,
  only: optionalEnum(['spicy', 'kids', 'ld', 'opt-in']),
  ...pageSearch,
});
export type ContentSearch = z.infer<typeof contentSearchSchema>;

export const reviewSearchSchema = z.object({ id: optionalString, ...pageSearch });

export const itemSearchSchema = z.object({
  tab: optionalEnum(['catalog', 'cards', 'steps', 'deck', 'history']),
});
