// Structured editing for type decks whose shape is a list of questions with `q`.
//
// Verified against the app's src/features/cards/play/types/model.ts (`TypeDeck`) and the 170 seeded
// items: V-TX, V-SL, V-RK, V-AV, V-SC, V-NEW-PL, V-PR and V-GU play `questions: Question[]`; V-FL and
// V-NH play `statements: Question[]` (`Question` = { q, intro?, followUp?, pick?, scale?, items?,
// list?, sub?, placeholder?, secondary?, softCheck? }). Every other type (L-PP, L-TY, L-SP, L-AC,
// L-RK, L-TD, L-DC, L-WJ, L-DR, V-YNM, V-GN, V-2T, D-PV, D-WK) keeps the JSON editor.
// Only `q`, `intro`, `followUp` and `pick` are edited here; every other key of an entry and of the
// deck is carried through untouched, in its original order.
import { parseJson } from '@/lib/json';

type Json = Record<string, unknown>;

export const STRUCTURED_DECKS: Record<string, 'questions' | 'statements'> = {
  'V-TX': 'questions',
  'V-SL': 'questions',
  'V-RK': 'questions',
  'V-AV': 'questions',
  'V-SC': 'questions',
  'V-NEW-PL': 'questions',
  'V-PR': 'questions',
  'V-GU': 'questions',
  'V-FL': 'statements',
  'V-NH': 'statements',
};

export interface DeckQuestion {
  q: string;
  intro: string;
  followUp: string;
  pick: string[];
  /** The entry as loaded (other keys, original order). */
  orig: Json;
}

export interface StructuredDeck {
  type: string;
  listKey: 'questions' | 'statements';
  entries: DeckQuestion[];
  /** The deck as loaded. */
  deck: Json;
}

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** The structured view of a deck, or null when its type is not structured or its shape differs. */
export function parseStructuredDeck(deckText: string): StructuredDeck | null {
  const parsed = parseJson(deckText);
  if (!parsed.ok || !isObj(parsed.value)) return null;
  const deck = parsed.value;
  const listKey = typeof deck.type === 'string' ? STRUCTURED_DECKS[deck.type] : undefined;
  const list = listKey ? deck[listKey] : undefined;
  if (!listKey || !Array.isArray(list) || !list.every((e) => isObj(e) && typeof e.q === 'string')) return null;
  return {
    type: deck.type as string,
    listKey,
    deck,
    entries: (list as Json[]).map((e) => ({
      q: str(e.q),
      intro: str(e.intro),
      followUp: str(e.followUp),
      pick: Array.isArray(e.pick) ? e.pick.filter((x): x is string => typeof x === 'string') : [],
      orig: e,
    })),
  };
}

function entryJson(e: DeckQuestion): Json {
  const edited: Json = { q: e.q };
  if (e.intro) edited.intro = e.intro;
  if (e.followUp) edited.followUp = e.followUp;
  if (e.pick.length) edited.pick = e.pick;
  const out: Json = {};
  for (const k of Object.keys(e.orig)) {
    if (k in edited) out[k] = edited[k];
    else if (!['q', 'intro', 'followUp', 'pick'].includes(k)) out[k] = e.orig[k];
    // A cleared managed key is dropped, unless the original was empty too (kept as it was).
    else if (k !== 'q' && (e.orig[k] === '' || (Array.isArray(e.orig[k]) && !(e.orig[k] as unknown[]).length))) out[k] = e.orig[k];
  }
  for (const k of Object.keys(edited)) if (!(k in out)) out[k] = edited[k];
  return out;
}

/** The deck JSON text for the editor (same formatting as the form uses). Unchanged entries come out identical. */
export function structuredDeckText(d: StructuredDeck): string {
  const out: Json = {};
  for (const k of Object.keys(d.deck)) out[k] = k === d.listKey ? d.entries.map(entryJson) : d.deck[k];
  return JSON.stringify(out, null, 2);
}

export const emptyQuestion = (): DeckQuestion => ({ q: '', intro: '', followUp: '', pick: [], orig: {} });

/** Problems the structured editor checks (the server checks lengths; empty question text it does not). */
export function structuredIssues(d: StructuredDeck): string | null {
  const i = d.entries.findIndex((e) => !e.q.trim());
  if (i >= 0) return `Question ${i + 1} needs text.`;
  const long = d.entries.findIndex((e) => e.q.length > 1000);
  if (long >= 0) return `Question ${long + 1}: at most 1000 characters.`;
  return null;
}
