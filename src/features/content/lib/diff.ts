// A per-field diff of two snapshots (live vs draft) for the review screen. Lists are compared
// item by item (cards, steps, deck rounds), so a clinician sees exactly which card changed.
import type { ContentSnapshot } from '../api/types';

export type DiffKind = 'same' | 'changed' | 'added' | 'removed';

export interface DiffRow {
  path: string;
  label: string;
  before: string | null;
  after: string | null;
  kind: DiffKind;
}

/** Set by the server from the item itself; never worth showing. */
const IDENTITY = new Set(['id', 'kind', 'pillar', 'code']);

const MAIN_KEYS = ['text', 'q', 'title', 'prompt', 'statement'];
const compact = (v: unknown) => JSON.stringify(v, null, 1).replace(/\n\s*/g, ' ');

/** Strings as they are; a card, step or round as its main text, then its other fields. */
const fmt = (v: unknown): string | null => {
  if (v === undefined) return null;
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const main = MAIN_KEYS.find((k) => typeof o[k] === 'string');
    if (main) {
      const rest = Object.fromEntries(Object.entries(o).filter(([k]) => k !== main));
      return Object.keys(rest).length ? `${o[main] as string}\n${compact(rest)}` : (o[main] as string);
    }
  }
  return compact(v);
};

const labelOf = (path: string) =>
  path
    .replace(/^catalog\./, '')
    .replace(/^body\./, '')
    .replace(/\[(\d+)\]/g, (_, i: string) => ` ${Number(i) + 1}`)
    .replace(/\./g, ' › ');

/** Main text of a card, step or round, when it has one. */
const mainOf = (v: unknown): { main: string; rest: Record<string, unknown> } | null => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const key = MAIN_KEYS.find((k) => typeof o[k] === 'string');
  return key
    ? { main: o[key] as string, rest: Object.fromEntries(Object.entries(o).filter(([k]) => k !== key)) }
    : null;
};

function row(path: string, a: unknown, b: unknown): DiffRow {
  let before = fmt(a);
  let after = fmt(b);
  // Only the text changed (the card's other fields match): show just the text on both sides.
  const ma = mainOf(a);
  const mb = mainOf(b);
  if (ma && mb && ma.main !== mb.main && compact(ma.rest) === compact(mb.rest)) {
    before = ma.main;
    after = mb.main;
  }
  const kind: DiffKind = before === after ? 'same' : before === null ? 'added' : after === null ? 'removed' : 'changed';
  return { path, label: labelOf(path), before, after, kind };
}

function walkList(path: string, a: unknown, b: unknown, out: DiffRow[]) {
  const x = Array.isArray(a) ? a : [];
  const y = Array.isArray(b) ? b : [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const ai = x[i];
    const bi = y[i];
    // A card or step: show its main text as the value and the rest only when it differs.
    if ((ai && typeof ai === 'object') || (bi && typeof bi === 'object')) out.push(row(`${path}[${i}]`, ai, bi));
    else out.push(row(`${path}[${i}]`, ai, bi));
  }
}

const keysOf = (a: unknown, b: unknown) => [
  ...new Set([...Object.keys((a as object) ?? {}), ...Object.keys((b as object) ?? {})]),
];

export function snapshotDiff(before: ContentSnapshot | null, after: ContentSnapshot | null): DiffRow[] {
  const out: DiffRow[] = [];
  const ac = before?.catalog ?? {};
  const bc = after?.catalog ?? {};
  for (const k of keysOf(ac, bc))
    if (!IDENTITY.has(k))
      out.push(row(`catalog.${k}`, (ac as Record<string, unknown>)[k], (bc as Record<string, unknown>)[k]));
  const ab = (before?.body ?? {}) as Record<string, unknown>;
  const bb = (after?.body ?? {}) as Record<string, unknown>;
  for (const k of keysOf(ab, bb)) {
    const a = ab[k];
    const b = bb[k];
    if (Array.isArray(a) || Array.isArray(b)) walkList(`body.${k}`, a, b, out);
    else if (k === 'deck' && (typeof a === 'object' || typeof b === 'object')) {
      for (const dk of keysOf(a, b)) {
        const da = (a as Record<string, unknown> | undefined)?.[dk];
        const db = (b as Record<string, unknown> | undefined)?.[dk];
        if (Array.isArray(da) || Array.isArray(db)) walkList(`body.deck.${dk}`, da, db, out);
        else out.push(row(`body.deck.${dk}`, da, db));
      }
    } else out.push(row(`body.${k}`, a, b));
  }
  return out;
}

export const changedRows = (rows: DiffRow[]) => rows.filter((r) => r.kind !== 'same');
