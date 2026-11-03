// Validates a pasted or uploaded content import (ContentImportItem[], at most 200) before it is
// sent. The server checks again and rejects items one by one; this catches mistakes early.
import { z } from 'zod';
import type { ContentImportItem } from '../api/types';
import { KINDS_BY_PILLAR } from '../api/types';

const ALL_KINDS = Object.values(KINDS_BY_PILLAR).flat();

export const importItemSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/, 'id: lowercase letters, digits and dashes, at most 80'),
    code: z
      .string()
      .regex(/^[A-Z][A-Z0-9-]{0,19}$/, 'code: like Q-1-01')
      .nullable()
      .optional(),
    pillar: z.enum(['quiz', 'play', 'do']),
    kind: z.string().refine((k) => ALL_KINDS.includes(k), 'kind: not a known kind'),
    catalog: z.looseObject({
      title: z
        .string()
        .trim()
        .min(1, 'catalog.title: 1 to 120 characters')
        .max(120, 'catalog.title: 1 to 120 characters'),
      where: z
        .array(z.enum(['anywhere', 'home', 'out', 'outside', 'apart']))
        .min(1)
        .optional(),
      minutes: z.number().int().min(1).max(10080).optional(),
    }),
    body: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((v, ctx) => {
    if (!KINDS_BY_PILLAR[v.pillar].includes(v.kind))
      ctx.addIssue({ code: 'custom', path: ['kind'], message: `kind: ${v.kind} is not a ${v.pillar} kind` });
    const body = v.body ?? {};
    if (v.kind.startsWith('type-')) {
      const deck = body.deck as Record<string, unknown> | undefined;
      if (!deck || typeof deck !== 'object' || typeof deck.type !== 'string')
        ctx.addIssue({
          code: 'custom',
          path: ['body', 'deck'],
          message: 'body.deck: required for a type item, with a type',
        });
    }
    if ((v.kind === 'quiz-turn' || v.kind === 'quiz-deck') && !(Array.isArray(body.cards) && body.cards.length > 0)) {
      ctx.addIssue({ code: 'custom', path: ['body', 'cards'], message: 'body.cards: at least one card' });
    }
    if (Array.isArray(body.cards)) {
      (body.cards as unknown[]).forEach((c, i) => {
        const t = (c as { text?: unknown })?.text;
        if (typeof t !== 'string' || !t.trim() || t.length > 1000)
          ctx.addIssue({
            code: 'custom',
            path: ['body', 'cards', i, 'text'],
            message: `body.cards[${i}].text: 1 to 1000 characters`,
          });
      });
    }
  });

export interface ImportRow {
  index: number;
  id: string;
  title: string;
  pillar: string;
  kind: string;
  problems: string[];
  item: ContentImportItem | null;
}

export type ImportParse = { ok: false; error: string } | { ok: true; rows: ImportRow[] };

/** Accepts `[...]` or `{ items: [...] }` (the API body), at most 200 items, ids unique. */
export function parseImport(value: unknown): ImportParse {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: unknown[] }).items
      : null;
  if (!list) return { ok: false, error: 'Expected a JSON array of items, or { "items": [...] }.' };
  if (list.length === 0) return { ok: false, error: 'The list is empty.' };
  if (list.length > 200) return { ok: false, error: `At most 200 items in one import (this has ${list.length}).` };
  const seen = new Set<string>();
  const rows = list.map((raw, index): ImportRow => {
    const r = importItemSchema.safeParse(raw);
    const o = (raw ?? {}) as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : '';
    const problems = r.success ? [] : r.error.issues.map((i) => i.message);
    if (id && seen.has(id)) problems.push('Listed twice in this import');
    seen.add(id);
    const catalog = (o.catalog ?? {}) as Record<string, unknown>;
    return {
      index,
      id: id || `#${index + 1}`,
      title: typeof catalog.title === 'string' ? catalog.title : '',
      pillar: String(o.pillar ?? ''),
      kind: String(o.kind ?? ''),
      problems,
      item: r.success && problems.length === 0 ? (r.data as ContentImportItem) : null,
    };
  });
  return { ok: true, rows };
}
