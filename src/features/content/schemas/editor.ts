// The item editor's form model and its codec to and from a ContentSnapshot.
// Validation mirrors the server rules in ADMIN_API.md › Content (title 1..120, where ⊂ the five
// values and non-empty, minutes 1..10080, card text 1..1000 and ≤ 100 cards, step title 1..200 and
// body 1..1000 and ≤ 30 steps, type items need a deck with a `type`, Your turn and Card deck
// quizzes need a card). Keys the form does not edit are carried through untouched.
import { z } from 'zod';
import { parseJson } from '@/lib/json';
import { parseStructuredDeck, structuredIssues } from '../lib/deck';
import { WHERES, type ContentCard, type ContentSnapshot, type DoPlanStep } from '../api/types';

export const LIMITS = {
  title: 120,
  text: 1000,
  minutes: 7 * 24 * 60,
  cards: 100,
  steps: 30,
  stepTitle: 200,
  list: 30,
  snapshotBytes: 256 * 1024,
} as const;
export const VIBES = ['calm', 'romantic', 'playful', 'adventurous', 'social'] as const;
export const PLAY_VALUES = ['one-phone', 'two-phones'] as const;
export const HOW_YOU_PLAY = ['One phone', 'Two phones'] as const;

type Json = Record<string, unknown>;

const text = (max: number = LIMITS.text) => z.string().max(max, `At most ${max} characters.`);
const list = (max = LIMITS.cards) => z.array(z.string().trim().min(1).max(LIMITS.text)).max(max);

/* ---------- Form schemas ---------- */

export const cardFormSchema = z.object({
  text: z.string().trim().min(1, 'Card text is required.').max(LIMITS.text, `At most ${LIMITS.text} characters.`),
  intro: text(),
  secondary: z.enum(['Everyday', 'Sensitive']).nullable(),
  followUp: text(),
  softCheck: z.boolean(),
  early: z.boolean(),
  pick: list(),
  label: text(),
  scale: z
    .object({ min: z.number().int(), max: z.number().int(), low: text(), high: text() })
    .refine((s) => s.max > s.min, { message: 'Max must be above min.', path: ['max'] })
    .nullable(),
  item: z.object({ title: text(), line: text() }).nullable(),
  items: list(),
  list: list(),
  /** The card as loaded (keys the form does not edit, and the empty values it had). */
  orig: z.record(z.string(), z.unknown()),
});
export type CardForm = z.infer<typeof cardFormSchema>;

export const stepFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Step title is required.')
    .max(LIMITS.stepTitle, `At most ${LIMITS.stepTitle} characters.`),
  body: z.string().trim().min(1, 'Step text is required.').max(LIMITS.text, `At most ${LIMITS.text} characters.`),
  minutes: z.number().int().min(1).max(LIMITS.minutes).nullable(),
  swapAt: z.number().int().min(1).max(LIMITS.minutes).nullable(),
  lead: text(),
  swap: z.object({ verb: text(80), verbIng: text(80), object: text(120) }).nullable(),
  orig: z.record(z.string(), z.unknown()),
});
export type StepForm = z.infer<typeof stepFormSchema>;

export const catalogFormSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(LIMITS.title, `At most ${LIMITS.title} characters.`),
  meta: text(200),
  emoji: text(16),
  where: z.array(z.enum(WHERES)).min(1, 'Pick at least one place.'),
  category: z.string().trim().min(1, 'Category is required.').max(40),
  sub: text(),
  minutes: z
    .number({ error: 'Minutes is required.' })
    .int('A whole number.')
    .min(1, 'At least 1 minute.')
    .max(LIMITS.minutes, `At most ${LIMITS.minutes} (a week).`),
  duration: text(),
  vibes: z.array(z.string()),
  play: z.string().nullable(),
  only: z.enum(['spicy', 'kids', 'ld', 'opt-in']).nullable(),
  price: z.number().min(0, 'Not below 0.').nullable(),
  sensitive: z.boolean(),
});
export type CatalogForm = z.infer<typeof catalogFormSchema>;

export const bodyFormSchema = z.object({
  intro: text(),
  howYouPlay: z.string().nullable(),
  howItPlays: text(),
  how: text(),
  safety: text(),
  followUp: text(),
  need: z.array(z.string().trim().min(1).max(200)).max(LIMITS.list),
  cards: z.array(cardFormSchema).max(LIMITS.cards, `At most ${LIMITS.cards} cards.`),
  steps: z.array(stepFormSchema).max(LIMITS.steps, `At most ${LIMITS.steps} steps.`),
  /** body.deck as JSON text (advanced). Empty = no deck. */
  deckText: z.string(),
});

/** The whole editor form, checked against the item's kind. */
export const editorSchema = (kind: string) =>
  z
    .object({
      catalog: catalogFormSchema,
      body: bodyFormSchema,
      /** Snapshot as loaded (unknown keys and empty values to keep). */
      base: z.custom<ContentSnapshot>(),
    })
    .superRefine((v, ctx) => {
      const deck = deckIssues(v.body.deckText, kind.startsWith('type-'));
      if (deck) ctx.addIssue({ code: 'custom', path: ['body', 'deckText'], message: deck });
      if ((kind === 'quiz-turn' || kind === 'quiz-deck') && v.body.cards.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['body', 'cards'], message: 'This kind plays cards: add at least one.' });
      }
    });
export type EditorValues = z.infer<ReturnType<typeof editorSchema>>;

export function deckIssues(deckText: string, required: boolean): string | null {
  if (!deckText.trim()) return required ? 'Type items play a deck: add one with a "type".' : null;
  const parsed = parseJson(deckText);
  if (!parsed.ok)
    return `Deck is not valid JSON${parsed.line ? ` (line ${parsed.line}, column ${parsed.column})` : ''}.`;
  const v = parsed.value;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'The deck must be an object.';
  if (typeof (v as Json).type !== 'string') return 'The deck needs a "type" (for example "V-YNM").';
  const structured = parseStructuredDeck(deckText);
  return structured ? structuredIssues(structured) : null;
}

/* ---------- Codec ---------- */

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

/** An empty form value: keep what the base had for that key (if it was empty too), else drop it. */
function put(out: Json, base: Json, key: string, value: unknown, isEmpty: boolean) {
  if (!isEmpty) out[key] = value;
  else if (key in base && isEmptyValue(base[key])) out[key] = base[key];
}
const isEmptyValue = (v: unknown) =>
  v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0);

const CARD_KEYS = [
  'text',
  'intro',
  'secondary',
  'followUp',
  'softCheck',
  'early',
  'pick',
  'label',
  'scale',
  'item',
  'items',
  'list',
];
const STEP_KEYS = ['title', 'body', 'minutes', 'swapAt', 'lead', 'swap'];
const CATALOG_KEYS = [
  'title',
  'meta',
  'emoji',
  'where',
  'category',
  'sub',
  'minutes',
  'duration',
  'vibes',
  'play',
  'only',
  'price',
  'sensitive',
];
const BODY_KEYS = ['intro', 'howYouPlay', 'howItPlays', 'how', 'safety', 'followUp', 'need', 'cards', 'steps', 'deck'];

/**
 * Merges the edited keys into the base object keeping the base's key order (the server compares
 * snapshots as JSON, so a reordered card would read as changed). Managed keys missing from
 * `edited` were cleared and are dropped; other base keys pass through; new keys go last.
 */
function ordered(base: Json, edited: Json, managed: string[]): Json {
  const out: Json = {};
  for (const k of Object.keys(base)) {
    if (k in edited) out[k] = edited[k];
    else if (!managed.includes(k)) out[k] = base[k];
  }
  for (const k of Object.keys(edited)) if (!(k in out)) out[k] = edited[k];
  return out;
}

export function cardToForm(c: ContentCard | Json): CardForm {
  const scale = isObj(c.scale) ? c.scale : null;
  const item = isObj(c.item) ? c.item : null;
  return {
    text: str(c.text),
    intro: str(c.intro),
    secondary: c.secondary === 'Everyday' || c.secondary === 'Sensitive' ? c.secondary : null,
    followUp: str(c.followUp),
    softCheck: c.softCheck === true,
    early: c.early === true,
    pick: strs(c.pick),
    label: str(c.label),
    scale: scale
      ? { min: num(scale.min) ?? 1, max: num(scale.max) ?? 5, low: str(scale.low), high: str(scale.high) }
      : null,
    item: item ? { title: str(item.title), line: str(item.line) } : null,
    items: strs(c.items),
    list: strs(c.list),
    orig: { ...c },
  };
}

export function cardFromForm(f: CardForm): ContentCard {
  const base = f.orig ?? {};
  const out: Json = {};
  // Keep the original key order where the card had the key; new keys follow.
  out.text = f.text.trim();
  put(out, base, 'intro', f.intro, !f.intro);
  put(out, base, 'secondary', f.secondary, !f.secondary);
  put(out, base, 'followUp', f.followUp, !f.followUp);
  put(out, base, 'softCheck', true, !f.softCheck);
  put(out, base, 'early', true, !f.early);
  put(out, base, 'pick', f.pick, f.pick.length === 0);
  put(out, base, 'label', f.label, !f.label);
  if (f.scale) out.scale = { ...(isObj(base.scale) ? base.scale : {}), ...f.scale };
  if (f.item) {
    const item: Json = { ...(isObj(base.item) ? base.item : {}), title: f.item.title };
    if (f.item.line) item.line = f.item.line;
    else delete item.line;
    out.item = item;
  }
  put(out, base, 'items', f.items, f.items.length === 0);
  put(out, base, 'list', f.list, f.list.length === 0);
  return ordered(base, out, CARD_KEYS) as ContentCard;
}

export function stepToForm(s: DoPlanStep | Json): StepForm {
  const swap = isObj(s.swap) ? s.swap : null;
  return {
    title: str(s.title),
    body: str(s.body),
    minutes: num(s.minutes),
    swapAt: num(s.swapAt),
    lead: str(s.lead),
    swap: swap ? { verb: str(swap.verb), verbIng: str(swap.verbIng), object: str(swap.object) } : null,
    orig: { ...s },
  };
}

export function stepFromForm(f: StepForm): DoPlanStep {
  const base = f.orig ?? {};
  const out: Json = { title: f.title.trim(), body: f.body.trim() };
  put(out, base, 'minutes', f.minutes, f.minutes == null);
  put(out, base, 'swapAt', f.swapAt, f.swapAt == null);
  put(out, base, 'lead', f.lead, !f.lead);
  if (f.swap) out.swap = { ...(isObj(base.swap) ? base.swap : {}), ...f.swap };
  return ordered(base, out, STEP_KEYS) as DoPlanStep;
}

export function snapshotToForm(s: ContentSnapshot): Pick<EditorValues, 'catalog' | 'body' | 'base'> {
  const c = s.catalog ?? ({} as Json);
  const b = s.body ?? {};
  return {
    catalog: {
      title: str(c.title),
      meta: str(c.meta),
      emoji: str(c.emoji),
      where: strs(c.where).filter((w): w is (typeof WHERES)[number] => (WHERES as readonly string[]).includes(w)),
      category: str(c.category),
      sub: str(c.sub),
      minutes: num(c.minutes) ?? 0,
      duration: str(c.duration),
      vibes: strs(c.vibes),
      play: typeof c.play === 'string' ? c.play : null,
      only: c.only === 'spicy' || c.only === 'kids' || c.only === 'ld' || c.only === 'opt-in' ? c.only : null,
      price: num(c.price),
      sensitive: c.sensitive === true,
    },
    body: {
      intro: str(b.intro),
      howYouPlay: typeof b.howYouPlay === 'string' ? b.howYouPlay : null,
      howItPlays: str(b.howItPlays),
      how: str(b.how),
      safety: str(b.safety),
      followUp: str(b.followUp),
      need: strs(b.need),
      cards: Array.isArray(b.cards) ? b.cards.map(cardToForm) : [],
      steps: Array.isArray(b.steps) ? b.steps.map(stepToForm) : [],
      deckText: isObj(b.deck) ? JSON.stringify(b.deck, null, 2) : '',
    },
    base: s,
  };
}

/** Builds the snapshot to save. Unchanged fields come out exactly as they went in. */
export function formToSnapshot(v: Pick<EditorValues, 'catalog' | 'body' | 'base'>): ContentSnapshot {
  const bc = (v.base?.catalog ?? {}) as Json;
  const bb = (v.base?.body ?? {}) as Json;
  const c = v.catalog;
  const catalog: Json = {};
  catalog.title = c.title.trim();
  put(catalog, bc, 'meta', c.meta, !c.meta);
  put(catalog, bc, 'emoji', c.emoji, !c.emoji);
  catalog.where = c.where;
  catalog.category = c.category;
  put(catalog, bc, 'sub', c.sub, !c.sub);
  catalog.minutes = c.minutes;
  put(catalog, bc, 'duration', c.duration, !c.duration);
  put(catalog, bc, 'vibes', c.vibes, c.vibes.length === 0);
  put(catalog, bc, 'play', c.play, !c.play);
  put(catalog, bc, 'only', c.only, !c.only);
  put(catalog, bc, 'price', c.price, c.price == null);
  put(catalog, bc, 'sensitive', true, !c.sensitive);

  const b = v.body;
  const body: Json = {};
  put(body, bb, 'intro', b.intro, !b.intro);
  put(body, bb, 'howYouPlay', b.howYouPlay, !b.howYouPlay);
  put(body, bb, 'howItPlays', b.howItPlays, !b.howItPlays);
  put(body, bb, 'how', b.how, !b.how);
  put(body, bb, 'safety', b.safety, !b.safety);
  put(body, bb, 'followUp', b.followUp, !b.followUp);
  put(body, bb, 'need', b.need, b.need.length === 0);
  put(body, bb, 'cards', b.cards.map(cardFromForm), b.cards.length === 0);
  put(body, bb, 'steps', b.steps.map(stepFromForm), b.steps.length === 0);
  if (b.deckText.trim()) {
    const parsed = parseJson(b.deckText);
    if (parsed.ok && isObj(parsed.value)) body.deck = parsed.value;
  }
  return {
    catalog: ordered(bc, catalog, CATALOG_KEYS) as ContentSnapshot['catalog'],
    body: ordered(bb, body, BODY_KEYS),
  };
}

export const emptyCard = (): CardForm => cardToForm({ text: '' });
export const emptyStep = (): StepForm => stepToForm({ title: '', body: '' });

/** Bytes of the snapshot as JSON (server limit 256 KB). */
export const snapshotBytes = (s: ContentSnapshot) => new TextEncoder().encode(JSON.stringify(s)).length;
