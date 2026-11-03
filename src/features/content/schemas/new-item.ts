import { z } from 'zod';
import { KINDS_BY_PILLAR, type ContentPillar, type ContentSnapshot } from '../api/types';

export const newItemSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{0,79}$/, 'Lowercase letters, digits and dashes (for example date-night-jar).'),
    code: z
      .string()
      .trim()
      .regex(/^([A-Z][A-Z0-9-]{0,19})?$/, 'Like Q-1-01, or leave empty.'),
    pillar: z.enum(['quiz', 'play', 'do']),
    kind: z.string().min(1, 'Pick a kind.'),
    title: z.string().trim().min(1, 'Title is required.').max(120),
    category: z.string().trim().min(1, 'Category is required.').max(40),
    deckType: z.string().trim().max(20),
    firstCard: z.string().trim().max(1000),
  })
  .superRefine((v, ctx) => {
    if (!KINDS_BY_PILLAR[v.pillar as ContentPillar].includes(v.kind))
      ctx.addIssue({ code: 'custom', path: ['kind'], message: 'Not a kind for this pillar.' });
    if (v.kind.startsWith('type-') && !v.deckType)
      ctx.addIssue({ code: 'custom', path: ['deckType'], message: 'Type items need a deck type (for example V-YNM).' });
    if ((v.kind === 'quiz-turn' || v.kind === 'quiz-deck') && !v.firstCard)
      ctx.addIssue({ code: 'custom', path: ['firstCard'], message: 'This kind needs a first card.' });
  });
export type NewItemValues = z.infer<typeof newItemSchema>;

/** The smallest valid snapshot for a new item of this kind. */
export function starterSnapshot(v: NewItemValues): ContentSnapshot {
  const body: ContentSnapshot['body'] = {};
  if (v.kind.startsWith('type-')) body.deck = { type: v.deckType };
  if (v.firstCard) body.cards = [{ text: v.firstCard }];
  return {
    catalog: {
      title: v.title,
      where: ['anywhere'],
      category: v.category,
      minutes: 10,
      duration: 'Under 15 min',
      vibes: [],
      price: null,
    },
    body,
  };
}

/** "my-new-quiz" from "My new quiz!". */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
