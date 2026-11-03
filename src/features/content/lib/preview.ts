import { parseJson } from '@/lib/json';

type Json = Record<string, unknown>;

/** The first playable entry of a type deck: rounds, questions, cards or steps. */
export function firstDeckEntry(deckText: string): { title: string; line?: string; options?: string[] } | null {
  const parsed = parseJson(deckText);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') return null;
  const deck = parsed.value as Json;
  for (const v of Object.values(deck)) {
    if (!Array.isArray(v) || v.length === 0) continue;
    const e = v[0] as Json | string;
    if (typeof e === 'string') return { title: e };
    const title = [e.q, e.text, e.prompt, e.title, e.statement, e.name].find((x) => typeof x === 'string') as
      string | undefined;
    if (!title) continue;
    const opts = [e.options, e.pick, e.answers].find((x) => Array.isArray(x)) as unknown[] | undefined;
    const line = [e.body, e.intro, e.line].find((x) => typeof x === 'string') as string | undefined;
    return { title, line, options: opts?.filter((x): x is string => typeof x === 'string') };
  }
  return null;
}
