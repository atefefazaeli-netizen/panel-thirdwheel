import { parseJson } from '@/lib/json';

type Json = Record<string, unknown>;
export type DeckEntry = { title: string; line?: string; options?: string[] };

function entryOf(e: unknown): DeckEntry | null {
  if (typeof e === 'string') return { title: e };
  if (Array.isArray(e)) return e.every((x) => typeof x === 'string') ? { title: (e as string[]).join(' · ') } : null;
  if (!e || typeof e !== 'object') return null;
  const o = e as Json;
  const title = [o.q, o.text, o.prompt, o.title, o.statement, o.name, o.answer].find((x) => typeof x === 'string') as
    | string
    | undefined;
  if (!title) return null;
  const opts = [o.options, o.pick, o.answers, o.list].find((x) => Array.isArray(x)) as unknown[] | undefined;
  const items = Array.isArray(o.items)
    ? (o.items as unknown[]).map((x) => (typeof x === 'string' ? x : ((x as Json)?.title as string))).filter(Boolean)
    : undefined;
  const line = [o.body, o.intro, o.line, o.sub, o.partnerLine].find((x) => typeof x === 'string') as string | undefined;
  const options = (opts ?? items)?.filter((x): x is string => typeof x === 'string');
  return { title, line, options: options?.length ? options : undefined };
}

/** Every playable entry of a type deck: the first list (rounds, questions, statements, cards, steps…) with text. */
export function deckEntries(deckText: string): DeckEntry[] {
  const parsed = parseJson(deckText);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') return [];
  for (const v of Object.values(parsed.value as Json)) {
    if (!Array.isArray(v) || v.length === 0) continue;
    const out = v.map(entryOf).filter((x): x is DeckEntry => !!x);
    if (out.length) return out;
  }
  return [];
}

/** The first playable entry of a type deck (kept for callers that show one). */
export function firstDeckEntry(deckText: string): DeckEntry | null {
  return deckEntries(deckText)[0] ?? null;
}
