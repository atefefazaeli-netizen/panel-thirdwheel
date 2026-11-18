// Round 4 board decks (app v2.3.0, Figma page 1775:7 "Quiz, Play & Do · new variants").
//
// An item plays a board when its body.deck.type is one of BOARD_TYPES (catalog.screen names the
// same board). The field shapes are read from the app repo's
// backend/apps/api/src/modules/content/domain/content.drafts.data.ts (the 12 drafts the backend
// seeds for clinician review). The server only checks that a deck is an object with a `type`, so
// the limits below are the panel's own guard rails: they block saving obvious mistakes (empty
// text, a die without six faces, a template naming a reel that doesn't exist) and warn when a
// deck is shorter than its session (cards then repeat).
//
// Editing never drops or reorders fields the panel doesn't know: a change writes back into the
// deck object as loaded, so unknown keys keep their value and position.
import { parseJson } from '@/lib/json';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

export const BOARD_TYPES = [
  'fill-the-blank',
  'swipe-to-choose',
  'spin-the-bottle',
  'roll-and-play',
  'spin-and-play',
  'date-slots',
  'scratch-and-do',
  'pick-a-card',
  'beat-the-clock',
  'draw-it',
  'rock-paper-scissors',
] as const;
export type BoardType = (typeof BOARD_TYPES)[number];
export const isBoardType = (t: unknown): t is BoardType =>
  typeof t === 'string' && (BOARD_TYPES as readonly string[]).includes(t);

export const BOARD_LABEL: Record<BoardType, string> = {
  'fill-the-blank': 'Fill the blank',
  'swipe-to-choose': 'You or Me · swipe',
  'spin-the-bottle': 'You or Me · spin the bottle',
  'roll-and-play': 'Roll & Play',
  'spin-and-play': 'Spin & Play',
  'date-slots': 'Date Slots',
  'scratch-and-do': 'Scratch & Do',
  'pick-a-card': 'Pick a Card',
  'beat-the-clock': 'Beat the Clock',
  'draw-it': 'Draw It',
  'rock-paper-scissors': 'Rock Paper Scissors',
};

/** Boards whose questions are the item's body.cards (edited in the Cards tab); the deck holds settings. */
export const BOARDS_WITH_BODY_CARDS: readonly BoardType[] = ['fill-the-blank', 'swipe-to-choose', 'spin-the-bottle'];

/* ---------- Field specs ---------- */

interface Base {
  key: string;
  label: string;
  hint?: string;
  /** Placeholders the text may use, shown as help ({p} = partner, {me} = the player…). */
  tokens?: string[];
}
export type TextSpec = Base & { kind: 'text'; required?: boolean; max: number; multiline?: boolean };
export type IntSpec = Base & { kind: 'int'; min: number; max: number; nullable?: string; optional?: boolean };
export type BoolSpec = Base & { kind: 'bool'; onlyIfPresent?: boolean };
export type EnumSpec = Base & { kind: 'enum'; options: { value: string; label: string }[] };
export type StringsSpec = Base & {
  kind: 'strings';
  itemLabel: string;
  itemMax: number;
  min?: number;
  max: number;
  exact?: number;
};
export type ObjectsSpec = Base & {
  kind: 'objects';
  itemLabel: string;
  fields: FieldSpec[];
  min?: number;
  max: number;
  exact?: number;
};
export type GroupSpec = Base & { kind: 'group'; fields: FieldSpec[] };
export type FieldSpec = TextSpec | IntSpec | BoolSpec | EnumSpec | StringsSpec | ObjectsSpec | GroupSpec;

const subtitle: TextSpec = {
  key: 'subtitle',
  label: 'Subtitle',
  kind: 'text',
  max: 60,
  hint: 'Small line under the title.',
};
const hint: TextSpec = { key: 'hint', label: 'Hint', kind: 'text', max: 120, tokens: ['{p}'] };
const youOrMe: FieldSpec[] = [
  {
    key: 'ask',
    label: 'Question stem',
    kind: 'text',
    required: true,
    max: 120,
    hint: 'Shown above every card, e.g. "Who’s most likely to…".',
  },
  {
    key: 'answers',
    label: 'Answer buttons',
    kind: 'strings',
    itemLabel: 'Answer',
    itemMax: 40,
    min: 2,
    max: 4,
    tokens: ['{me}', '{p}'],
    hint: '{me} and {p} become the two names.',
  },
  {
    key: 'cards',
    label: 'Questions per session',
    kind: 'int',
    min: 1,
    max: 30,
    hint: 'The questions are the Cards tab.',
  },
];

export const BOARD_FIELDS: Record<BoardType, FieldSpec[]> = {
  'fill-the-blank': [
    { key: 'prompt', label: 'Prompt', kind: 'text', required: true, max: 300 },
    {
      key: 'words',
      label: 'Words to fill the blank',
      kind: 'strings',
      itemLabel: 'Word',
      itemMax: 40,
      min: 2,
      max: 10,
    },
    {
      key: 'skips',
      label: 'Skip answers',
      kind: 'strings',
      itemLabel: 'Skip',
      itemMax: 40,
      max: 4,
      hint: 'Extra answers that skip the card.',
    },
  ],
  'swipe-to-choose': youOrMe,
  'spin-the-bottle': youOrMe,
  'roll-and-play': [
    {
      key: 'skin',
      label: 'Skin',
      kind: 'enum',
      options: [
        { value: 'light', label: 'Light' },
        { value: 'spicy', label: 'Spicy' },
      ],
      hint: 'Spicy uses the Spicy look. The item must also be Spicy-only (Catalog › Shows only when).',
    },
    subtitle,
    { key: 'rolls', label: 'Rolls per session', kind: 'int', min: 1, max: 50 },
    { key: 'rerolls', label: 'Re-rolls', kind: 'int', min: 0, max: 10, nullable: 'No re-rolls' },
    { key: 'points', label: 'Score points', kind: 'bool', onlyIfPresent: true },
    {
      key: 'actions',
      label: 'Action die',
      kind: 'objects',
      itemLabel: 'Action',
      exact: 6,
      max: 6,
      hint: 'A die has six faces.',
      fields: [
        { key: 'word', label: 'Word on the die', kind: 'text', required: true, max: 20 },
        {
          key: 'prompt',
          label: 'What to do',
          kind: 'text',
          required: true,
          max: 200,
          tokens: ['{p}', '{topic}'],
          multiline: true,
        },
      ],
    },
    {
      key: 'topics',
      label: 'Topic die',
      kind: 'objects',
      itemLabel: 'Topic',
      exact: 6,
      max: 6,
      hint: 'A die has six faces.',
      fields: [
        { key: 'word', label: 'Word on the die', kind: 'text', required: true, max: 20 },
        {
          key: 'phrase',
          label: 'Phrase in the prompt',
          kind: 'text',
          required: true,
          max: 80,
          hint: 'Replaces {topic}.',
        },
      ],
    },
    hint,
    { key: 'footnote', label: 'Footnote', kind: 'text', max: 120, tokens: ['{n}'], hint: '{n} = re-rolls left.' },
  ],
  'spin-and-play': [
    subtitle,
    { key: 'spins', label: 'Spins per session', kind: 'int', min: 1, max: 30 },
    {
      key: 'slices',
      label: 'Wheel slices',
      kind: 'objects',
      itemLabel: 'Slice',
      min: 2,
      max: 12,
      fields: [
        { key: 'label', label: 'Label on the wheel', kind: 'text', required: true, max: 24 },
        {
          key: 'prompt',
          label: 'What to do',
          kind: 'text',
          required: true,
          max: 200,
          tokens: ['{p}'],
          multiline: true,
        },
      ],
    },
    hint,
  ],
  'date-slots': [
    subtitle,
    { key: 'pulls', label: 'Pulls per session', kind: 'int', min: 1, max: 30 },
    {
      key: 'reels',
      label: 'Reels',
      kind: 'objects',
      itemLabel: 'Reel',
      min: 1,
      max: 4,
      fields: [
        {
          key: 'label',
          label: 'Reel name',
          kind: 'text',
          required: true,
          max: 20,
          hint: 'The template uses it in lower case: MOVE → {move}.',
        },
        { key: 'words', label: 'Words on the reel', kind: 'strings', itemLabel: 'Word', itemMax: 60, min: 2, max: 12 },
      ],
    },
    {
      key: 'template',
      label: 'Result sentence',
      kind: 'text',
      required: true,
      max: 120,
      hint: 'Name each reel in braces, e.g. {move}, {where}, for {for}.',
    },
    hint,
  ],
  'scratch-and-do': [
    subtitle,
    { key: 'cards', label: 'Cards per session', kind: 'int', min: 1, max: 20 },
    { key: 'headline', label: 'Headline', kind: 'text', required: true, max: 80 },
    { key: 'revealed', label: 'Line once scratched', kind: 'text', required: true, max: 80 },
    {
      key: 'grid',
      label: 'Foil grid',
      kind: 'group',
      fields: [
        { key: 'cols', label: 'Columns', kind: 'int', min: 2, max: 20 },
        { key: 'rows', label: 'Rows', kind: 'int', min: 2, max: 20 },
        {
          key: 'opensAt',
          label: 'Opens at (%)',
          kind: 'int',
          min: 1,
          max: 100,
          hint: 'How much foil to scratch before the dare shows.',
        },
      ],
    },
    {
      key: 'dares',
      label: 'Dares',
      kind: 'objects',
      itemLabel: 'Dare',
      min: 1,
      max: 30,
      fields: [
        { key: 'tag', label: 'Tag', kind: 'text', required: true, max: 40 },
        { key: 'text', label: 'Dare', kind: 'text', required: true, max: 300, multiline: true },
        { key: 'minutes', label: 'Minutes', kind: 'int', min: 1, max: 60, optional: true },
      ],
    },
  ],
  'pick-a-card': [
    subtitle,
    { key: 'rounds', label: 'Rounds', kind: 'int', min: 1, max: 30 },
    { key: 'deal', label: 'Cards dealt per round', kind: 'int', min: 1, max: 5 },
    { key: 'headline', label: 'Headline', kind: 'text', required: true, max: 80 },
    { key: 'picked', label: 'Line once picked', kind: 'text', required: true, max: 80 },
    { key: 'footer', label: 'Footer', kind: 'text', required: true, max: 120 },
    {
      key: 'cards',
      label: 'Cards',
      kind: 'objects',
      itemLabel: 'Card',
      min: 1,
      max: 40,
      fields: [
        { key: 'tag', label: 'Tag', kind: 'text', required: true, max: 40 },
        { key: 'text', label: 'Card', kind: 'text', required: true, max: 300, multiline: true },
      ],
    },
    {
      key: 'decks',
      label: 'Extra decks',
      kind: 'objects',
      itemLabel: 'Deck',
      max: 5,
      fields: [
        { key: 'name', label: 'Name', kind: 'text', required: true, max: 40 },
        { key: 'id', label: 'Id', kind: 'text', required: true, max: 40 },
        { key: 'game', label: 'Game code', kind: 'text', max: 10, hint: 'The game it borrows from, e.g. G-1-07.' },
        { key: 'headline', label: 'Headline', kind: 'text', required: true, max: 80 },
        { key: 'tag', label: 'Tag', kind: 'text', required: true, max: 40 },
        { key: 'footer', label: 'Footer', kind: 'text', max: 120 },
        { key: 'cards', label: 'Cards per session', kind: 'int', min: 1, max: 30 },
        { key: 'seconds', label: 'Seconds per card', kind: 'int', min: 5, max: 300 },
        { key: 'words', label: 'Words', kind: 'strings', itemLabel: 'Word', itemMax: 60, min: 1, max: 40 },
      ],
    },
  ],
  'beat-the-clock': [
    subtitle,
    { key: 'rounds', label: 'Rounds', kind: 'int', min: 1, max: 20 },
    { key: 'seconds', label: 'Seconds per round', kind: 'int', min: 10, max: 300 },
    { key: 'target', label: 'Target', kind: 'int', min: 1, max: 50, hint: 'How many to name before time runs out.' },
    { key: 'challenges', label: 'Challenges', kind: 'strings', itemLabel: 'Challenge', itemMax: 300, min: 1, max: 30 },
  ],
  'draw-it': [
    subtitle,
    { key: 'words', label: 'Words to draw', kind: 'strings', itemLabel: 'Word', itemMax: 60, min: 2, max: 60 },
    { key: 'choices', label: 'Answers to choose from', kind: 'int', min: 2, max: 6 },
    {
      key: 'perPlayer',
      label: 'Drawings per player',
      kind: 'int',
      min: 1,
      max: 10,
      hint: 'Draw Me in 30 in Our league: each player scores +1 per word guessed. A draw scores nothing, no upset bonus.',
    },
    { key: 'seconds', label: 'Seconds per drawing', kind: 'int', min: 10, max: 300 },
  ],
  'rock-paper-scissors': [
    subtitle,
    {
      key: 'rounds',
      label: 'Rounds',
      kind: 'int',
      min: 1,
      max: 30,
      hint: 'Our league (rock_paper_scissors): each player scores +1 per round won. A draw scores nothing, no upset bonus.',
    },
    { key: 'dares', label: 'Dares for the loser', kind: 'strings', itemLabel: 'Dare', itemMax: 300, min: 1, max: 40 },
    { key: 'lose', label: 'Loser line', kind: 'text', required: true, max: 120, tokens: ['{loser}'] },
    {
      key: 'draw',
      label: 'On a draw',
      kind: 'group',
      fields: [
        { key: 'title', label: 'Title', kind: 'text', required: true, max: 60 },
        { key: 'line', label: 'Line', kind: 'text', max: 120 },
      ],
    },
  ],
};

/* ---------- Parse and write ---------- */

export interface BoardDeck {
  type: BoardType;
  /** The deck object exactly as loaded (unknown keys included). */
  deck: Json;
}

/** The board deck in a deck JSON text, or null for anything else (not JSON, other types). */
export function parseBoardDeck(deckText: string): BoardDeck | null {
  if (!deckText.trim()) return null;
  const parsed = parseJson(deckText);
  if (!parsed.ok || !isObj(parsed.value) || !isBoardType(parsed.value.type)) return null;
  return { type: parsed.value.type, deck: parsed.value };
}

export const boardDeckText = (deck: Json) => JSON.stringify(deck, null, 2);

/** The value at a path ("grid.cols", "actions.2.prompt"). */
export function getAt(obj: unknown, path: (string | number)[]): unknown {
  let cur = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Json)[k as string];
  }
  return cur;
}

/**
 * A copy with the value at `path` replaced. Keys keep their position, untouched keys keep their
 * value; `undefined` removes an object key (used for empty optional text).
 */
export function setAt<T>(obj: T, path: (string | number)[], value: unknown): T {
  if (!path.length) return value as T;
  const [k, ...rest] = path;
  if (Array.isArray(obj)) {
    const copy = [...obj];
    copy[k as number] = setAt(copy[k as number], rest, value);
    return copy as T;
  }
  const src: Json = isObj(obj) ? obj : {};
  const next = rest.length ? setAt(src[k as string], rest, value) : value;
  const out: Json = { ...src };
  if (next === undefined) delete out[k as string];
  else out[k as string] = next;
  return out as T;
}

/** An empty item for a list field (text '' and ints at their minimum; optional fields left out). */
export function emptyItem(spec: StringsSpec | ObjectsSpec): unknown {
  if (spec.kind === 'strings') return '';
  const item: Json = {};
  for (const f of spec.fields) {
    if (f.kind === 'text' && f.required) item[f.key] = '';
    if (f.kind === 'int' && !f.optional && !f.nullable) item[f.key] = f.min;
    if (f.kind === 'strings') item[f.key] = [];
  }
  return item;
}

/* ---------- Validation ---------- */

export interface BoardProblem {
  /** Dotted path in the deck ("actions.2.prompt"), or "cards" for the item's body cards. */
  path: string;
  message: string;
}

function checkField(spec: FieldSpec, value: unknown, path: string, out: BoardProblem[]) {
  const at = path ? `${path}.${spec.key}` : spec.key;
  switch (spec.kind) {
    case 'text': {
      if (value === undefined || value === null) {
        if (spec.required) out.push({ path: at, message: `${spec.label}: needed.` });
        return;
      }
      if (typeof value !== 'string') out.push({ path: at, message: `${spec.label}: must be text.` });
      else if (spec.required && !value.trim()) out.push({ path: at, message: `${spec.label}: needed.` });
      else if (value.length > spec.max)
        out.push({ path: at, message: `${spec.label}: at most ${spec.max} characters.` });
      return;
    }
    case 'int': {
      if (value === undefined) {
        if (!spec.optional && !spec.nullable) out.push({ path: at, message: `${spec.label}: needed.` });
        return;
      }
      if (value === null) {
        if (!spec.nullable) out.push({ path: at, message: `${spec.label}: needed.` });
        return;
      }
      if (typeof value !== 'number' || !Number.isInteger(value) || value < spec.min || value > spec.max)
        out.push({ path: at, message: `${spec.label}: a whole number from ${spec.min} to ${spec.max}.` });
      return;
    }
    case 'bool':
      if (value !== undefined && typeof value !== 'boolean')
        out.push({ path: at, message: `${spec.label}: on or off.` });
      return;
    case 'enum':
      if (!spec.options.some((o) => o.value === value))
        out.push({ path: at, message: `${spec.label}: one of ${spec.options.map((o) => o.label).join(', ')}.` });
      return;
    case 'group':
      if (!isObj(value)) {
        out.push({ path: at, message: `${spec.label}: needed.` });
        return;
      }
      for (const f of spec.fields) checkField(f, value[f.key], at, out);
      return;
    case 'strings':
    case 'objects': {
      if (value === undefined && !spec.min && !spec.exact) return;
      if (!Array.isArray(value)) {
        out.push({ path: at, message: `${spec.label}: a list.` });
        return;
      }
      const n = value.length;
      if (spec.exact !== undefined && n !== spec.exact)
        out.push({
          path: at,
          message: `${spec.label}: exactly ${spec.exact} (now ${n}).${spec.hint ? ` ${spec.hint}` : ''}`,
        });
      else if (spec.min !== undefined && n < spec.min)
        out.push({ path: at, message: `${spec.label}: at least ${spec.min}.` });
      else if (n > spec.max) out.push({ path: at, message: `${spec.label}: at most ${spec.max}.` });
      value.forEach((item, i) => {
        const ip = `${at}.${i}`;
        if (spec.kind === 'strings') {
          if (typeof item !== 'string' || !item.trim())
            out.push({ path: ip, message: `${spec.itemLabel} ${i + 1}: needs text.` });
          else if (item.length > spec.itemMax)
            out.push({ path: ip, message: `${spec.itemLabel} ${i + 1}: at most ${spec.itemMax} characters.` });
        } else if (!isObj(item)) out.push({ path: ip, message: `${spec.itemLabel} ${i + 1}: must be an object.` });
        else
          for (const f of spec.fields) {
            const before = out.length;
            checkField(f, item[f.key], ip, out);
            for (let j = before; j < out.length; j++)
              out[j] = { ...out[j]!, message: `${spec.itemLabel} ${i + 1}, ${out[j]!.message}` };
          }
      });
      return;
    }
  }
}

const BLANK = '___';
const placeholders = (s: string) => [...s.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]!);

/**
 * Problems that block saving. `cards` = the item's body.cards texts (Fill the blank and You or Me
 * play them).
 */
export function boardIssues(board: BoardDeck, cards: readonly string[] = []): BoardProblem[] {
  const out: BoardProblem[] = [];
  const d = board.deck;
  for (const f of BOARD_FIELDS[board.type]) checkField(f, d[f.key], '', out);
  if (board.type === 'fill-the-blank')
    cards.forEach((t, i) => {
      if (!t.includes(BLANK)) out.push({ path: 'cards', message: `Card ${i + 1}: needs a blank (${BLANK}) to fill.` });
    });
  if (board.type === 'date-slots' && typeof d.template === 'string' && Array.isArray(d.reels)) {
    const names = d.reels.map((r) => (isObj(r) && typeof r.label === 'string' ? r.label.toLowerCase() : ''));
    for (const p of placeholders(d.template))
      if (!names.includes(p.toLowerCase()))
        out.push({ path: 'template', message: `Result sentence: {${p}} is not a reel name.` });
  }
  if (board.type === 'draw-it' && Array.isArray(d.words) && typeof d.choices === 'number' && d.words.length < d.choices)
    out.push({
      path: 'words',
      message: `Words to draw: at least as many as the answers to choose from (${d.choices}).`,
    });
  if (board.type === 'pick-a-card' && Array.isArray(d.cards) && typeof d.deal === 'number' && d.cards.length < d.deal)
    out.push({ path: 'cards', message: `Cards: at least as many as are dealt per round (${d.deal}).` });
  return out;
}

/** The first blocking problem as one line (for the form's deck error), or null. */
export function firstBoardIssue(board: BoardDeck, cards: readonly string[] = []): string | null {
  return boardIssues(board, cards)[0]?.message ?? null;
}

/* ---------- Session length ---------- */

export interface Shortfall {
  /** What runs short: "questions", "dares"… */
  what: string;
  have: number;
  need: number;
  /** Where to add more: the deck field, or "cards" for the Cards tab. */
  field: string;
  /** Extra deck in Pick a Card, by name. */
  deckName?: string;
}

const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : 0);

/** Lists shorter than their session (the app then repeats cards). A warning, never a block. */
export function sessionShortfalls(board: BoardDeck, cardCount = 0): Shortfall[] {
  const d = board.deck;
  const out: Shortfall[] = [];
  const add = (what: string, have: number, need: number, field: string, deckName?: string) => {
    if (need > 0 && have < need) out.push({ what, have, need, field, deckName });
  };
  switch (board.type) {
    case 'swipe-to-choose':
    case 'spin-the-bottle':
      add('questions', cardCount, int(d.cards), 'cards');
      break;
    case 'scratch-and-do':
      add('dares', len(d.dares), int(d.cards), 'dares');
      break;
    case 'beat-the-clock':
      add('challenges', len(d.challenges), int(d.rounds), 'challenges');
      break;
    case 'rock-paper-scissors':
      add('dares', len(d.dares), int(d.rounds), 'dares');
      break;
    case 'draw-it':
      add('words', len(d.words), int(d.perPlayer) * 2, 'words');
      break;
    case 'pick-a-card':
      (Array.isArray(d.decks) ? d.decks : []).forEach((x) => {
        if (isObj(x))
          add('words', len(x.words), int(x.cards), 'decks', typeof x.name === 'string' ? x.name : 'Extra deck');
      });
      break;
  }
  return out;
}

export const shortfallText = (s: Shortfall) =>
  `${s.deckName ? `${s.deckName}: d` : 'D'}eck shorter than the session: ${s.have} of ${s.need} ${s.what}. They repeat until there are ${s.need}.`;

/* ---------- Preview text ---------- */

export interface PreviewSection {
  title: string;
  lines: string[];
}

const s = (v: unknown) => (typeof v === 'string' ? v : '');
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const objs = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : []);

/** Sample names for the preview: the app fills these from the couple's names. */
export const PREVIEW_NAMES = { me: 'Sara', partner: 'Alex' } as const;

/**
 * Fills the app's placeholders with sample names so the preview reads as the couple sees it:
 * {me} and {loser} = Sara, {p} = Alex; `extra` fills board tokens ({topic}, {n}, reel names).
 */
export function fillTokens(text: string, extra: Record<string, string> = {}): string {
  const map: Record<string, string> = {
    me: PREVIEW_NAMES.me,
    p: PREVIEW_NAMES.partner,
    loser: PREVIEW_NAMES.me,
    ...extra,
  };
  return text.replace(/\{([a-zA-Z]+)\}/g, (m, k: string) => map[k] ?? map[k.toLowerCase()] ?? m);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The text a board shows, grouped, as plain lines: placeholders filled with sample names
 * ({@link PREVIEW_NAMES}), counts in the titles, one example roll / pull, and the session length.
 */
export function boardPreview(board: BoardDeck, cards: readonly string[] = []): PreviewSection[] {
  const d = board.deck;
  const sec = (title: string, lines: string[]) => (lines.length ? [{ title, lines }] : []);
  const t = (v: unknown, extra?: Record<string, string>) => fillTokens(s(v), extra);
  const session = (...parts: (string | null)[]) => sec('Session', [parts.filter(Boolean).join(' · ')].filter(Boolean));
  switch (board.type) {
    case 'fill-the-blank':
      return [
        ...sec('Prompt', [t(d.prompt)].filter(Boolean)),
        ...sec(
          `Cards (${cards.length})`,
          cards.map((c) => fillTokens(c)),
        ),
        ...sec('Answers', [strs(d.words).join(' · ')].filter(Boolean)),
        ...sec('Skip', strs(d.skips)),
      ];
    case 'swipe-to-choose':
    case 'spin-the-bottle': {
      const ask = t(d.ask);
      const n = num(d.cards);
      return [
        ...sec(
          `Questions (${cards.length})`,
          cards.map((c) => fillTokens(ask ? `${ask} ${c.charAt(0).toLowerCase()}${c.slice(1)}` : c)),
        ),
        ...sec(
          'Answers',
          [
            strs(d.answers)
              .map((a) => fillTokens(a))
              .join(' · '),
          ].filter(Boolean),
        ),
        ...session(n !== null ? plural(n, 'question') : null),
      ];
    }
    case 'roll-and-play': {
      const actions = objs(d.actions);
      const topics = objs(d.topics);
      const rerolls = num(d.rerolls);
      const example = actions[0] && topics[0] ? t(actions[0].prompt, { topic: s(topics[0].phrase) }) : '';
      return [
        ...sec(
          `Action die (${plural(actions.length, 'face')})`,
          actions.map((a) => `${s(a.word)}: ${t(a.prompt, { topic: '(topic)' })}`),
        ),
        ...sec(
          `Topic die (${plural(topics.length, 'face')})`,
          topics.map((x) => `${s(x.word)}: ${s(x.phrase)}`),
        ),
        ...sec('Example roll', example ? [`${s(actions[0]!.word)} + ${s(topics[0]!.word)}: ${example}`] : []),
        ...sec('Lines', [t(d.hint), t(d.footnote, { n: String(rerolls ?? 0) })].filter(Boolean)),
        ...session(
          num(d.rolls) !== null ? plural(num(d.rolls)!, 'roll') : null,
          rerolls === null ? 'No re-rolls' : plural(rerolls, 're-roll'),
          d.skin === 'spicy' ? 'Spicy skin' : null,
        ),
      ];
    }
    case 'spin-and-play': {
      const slices = objs(d.slices);
      return [
        ...sec(
          `Wheel slices (${slices.length})`,
          slices.map((x) => `${s(x.label)}: ${t(x.prompt)}`),
        ),
        ...sec('Lines', [t(d.hint)].filter(Boolean)),
        ...session(num(d.spins) !== null ? plural(num(d.spins)!, 'spin') : null),
      ];
    }
    case 'date-slots': {
      const reels = objs(d.reels);
      const firsts = Object.fromEntries(reels.map((r) => [s(r.label).toLowerCase(), strs(r.words)[0] ?? '']));
      const example = s(d.template) ? fillTokens(s(d.template), firsts) : '';
      return [
        ...reels.flatMap((r) =>
          sec(`Reel ${s(r.label) || '?'} (${strs(r.words).length})`, [strs(r.words).join(' · ')]),
        ),
        ...sec('Example pull', example ? [example.charAt(0).toUpperCase() + example.slice(1)] : []),
        ...sec('Lines', [t(d.hint)].filter(Boolean)),
        ...session(num(d.pulls) !== null ? plural(num(d.pulls)!, 'pull') : null),
      ];
    }
    case 'scratch-and-do': {
      const dares = objs(d.dares);
      return [
        ...sec('Lines', [t(d.headline), t(d.revealed)].filter(Boolean)),
        ...sec(
          `Dares (${dares.length})`,
          dares.map((x) => `${s(x.tag)}: ${t(x.text)}`),
        ),
        ...session(num(d.cards) !== null ? plural(num(d.cards)!, 'card') : null),
      ];
    }
    case 'pick-a-card': {
      const list = objs(d.cards);
      return [
        ...sec('Lines', [t(d.headline), t(d.picked), t(d.footer)].filter(Boolean)),
        ...sec(
          `Cards (${list.length})`,
          list.map((x) => `${s(x.tag)}: ${t(x.text)}`),
        ),
        ...objs(d.decks).flatMap((x) =>
          sec(`${s(x.name) || 'Extra deck'} (${strs(x.words).length} of ${num(x.cards) ?? '?'} words)`, strs(x.words)),
        ),
        ...session(
          num(d.rounds) !== null ? plural(num(d.rounds)!, 'round') : null,
          num(d.deal) !== null ? `${num(d.deal)} cards dealt` : null,
        ),
      ];
    }
    case 'beat-the-clock': {
      const list = strs(d.challenges);
      return [
        ...sec(
          `Challenges (${list.length})`,
          list.map((c) => fillTokens(c)),
        ),
        ...session(
          num(d.rounds) !== null ? plural(num(d.rounds)!, 'round') : null,
          num(d.seconds) !== null ? `${num(d.seconds)} seconds each` : null,
          num(d.target) !== null ? `target ${num(d.target)}` : null,
        ),
      ];
    }
    case 'draw-it': {
      const list = strs(d.words);
      return [
        ...sec(`Words to draw (${list.length})`, list),
        ...session(
          num(d.perPlayer) !== null ? `${plural(num(d.perPlayer)!, 'drawing')} each` : null,
          num(d.seconds) !== null ? `${num(d.seconds)} seconds` : null,
          num(d.choices) !== null ? `${num(d.choices)} answers to pick from` : null,
        ),
      ];
    }
    case 'rock-paper-scissors': {
      const list = strs(d.dares);
      return [
        ...sec(
          `Dares for the loser (${list.length})`,
          list.map((x) => fillTokens(x)),
        ),
        ...sec(
          'Lines',
          [t(d.lose), isObj(d.draw) ? [t(d.draw.title), t(d.draw.line)].filter(Boolean).join(' ') : ''].filter(Boolean),
        ),
        ...session(num(d.rounds) !== null ? plural(num(d.rounds)!, 'round') : null),
      ];
    }
  }
}

/** Fill the blank: a card's before / after, from its text split at the blank (null when there is none). */
export function splitBlank(text: string): { before: string; after: string } | null {
  const i = text.indexOf(BLANK);
  if (i < 0) return null;
  return { before: text.slice(0, i).trim(), after: text.slice(i + BLANK.length).trim() };
}

/* ---------- Going live (app v2.5.0) ---------- */

/** The backend's MIN_DECK_CARDS: a new-board deck needs this many cards to go live. */
export const MIN_DECK_CARDS = 5;

/**
 * The backend's `deckSize` (content.ts, v2.5.0): cards in a new-board deck, counted the way approve
 * counts them. Quiz cards, dice faces (the smaller die), wheel slices, the shortest reel, dares,
 * cards, challenges. Null when the rule doesn't apply: Release 1 formats, Draw It and Rock Paper
 * Scissors (its dares are only the loser's forfeit; the rounds are the game).
 */
export function deckSize(body: unknown): number | null {
  const b = isObj(body) ? body : {};
  const d = isObj(b.deck) ? b.deck : {};
  switch (d.type) {
    case 'fill-the-blank':
    case 'swipe-to-choose':
    case 'spin-the-bottle':
      return len(b.cards);
    case 'roll-and-play':
      return Math.min(len(d.actions), len(d.topics));
    case 'spin-and-play':
      return len(d.slices);
    case 'date-slots':
      return Array.isArray(d.reels) && d.reels.length
        ? Math.min(...d.reels.map((r) => len(isObj(r) ? r.words : undefined)))
        : 0;
    case 'scratch-and-do':
      return len(d.dares);
    case 'pick-a-card':
      return len(d.cards);
    case 'beat-the-clock':
      return len(d.challenges);
    default:
      return null;
  }
}

/** What the deck counts for the go-live rule, in words ("dares", "faces on the smaller die"…). */
const SIZE_WHAT: Partial<Record<BoardType, string>> = {
  'fill-the-blank': 'cards (Cards tab)',
  'swipe-to-choose': 'questions (Cards tab)',
  'spin-the-bottle': 'questions (Cards tab)',
  'roll-and-play': 'faces on each die',
  'spin-and-play': 'wheel slices',
  'date-slots': 'words on the shortest reel',
  'scratch-and-do': 'dares',
  'pick-a-card': 'cards',
  'beat-the-clock': 'challenges',
};

/** Why a board can't be approved yet (the server answers 409 DECK_TOO_SHORT), or null. */
export function goLiveShortfall(body: unknown): { size: number; what: string; text: string } | null {
  const size = deckSize(body);
  if (size === null || size >= MIN_DECK_CARDS) return null;
  const type = (isObj(body) && isObj(body.deck) ? body.deck.type : '') as BoardType;
  const what = SIZE_WHAT[type] ?? 'cards';
  return {
    size,
    what,
    text: `Too short to go live: ${size} of the ${MIN_DECK_CARDS} ${what} it needs before a clinician can approve it.`,
  };
}

/** The board deck and card texts of a saved snapshot (draft or live), or null when it plays no board. */
export function boardOfSnapshot(
  snapshot: { body?: Record<string, unknown> } | null | undefined,
): { board: BoardDeck; cards: string[] } | null {
  const deck = snapshot?.body?.deck;
  if (!isObj(deck) || !isBoardType(deck.type)) return null;
  const cards = Array.isArray(snapshot?.body?.cards)
    ? (snapshot.body.cards as unknown[]).map((c) => (isObj(c) && typeof c.text === 'string' ? c.text : ''))
    : [];
  return { board: { type: deck.type, deck }, cards };
}
