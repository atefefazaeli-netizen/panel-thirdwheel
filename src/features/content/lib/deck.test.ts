import { describe, expect, it } from 'vitest';
import seed from '@/mocks/data/content-seed.json';
import { deckEntries } from './preview';
import { emptyQuestion, parseStructuredDeck, STRUCTURED_DECKS, structuredDeckText, structuredIssues } from './deck';

type Seed = { id: string; kind: string; body: { deck?: Record<string, unknown> & { type: string } } };
const decks = (seed as unknown as Seed[]).filter((s) => s.body.deck);
const text = (d: unknown) => JSON.stringify(d, null, 2);

describe('structured deck editor (10 question-list types)', () => {
  it('every seeded deck of a structured type parses, and an untouched deck comes back byte for byte', () => {
    const structured = decks.filter((s) => STRUCTURED_DECKS[s.body.deck!.type]);
    expect(structured.length).toBe(62);
    for (const s of structured) {
      const d = parseStructuredDeck(text(s.body.deck));
      expect([s.id, d?.type]).toEqual([s.id, s.body.deck!.type]);
      expect(structuredDeckText(d!)).toBe(text(s.body.deck));
    }
  });

  it('other types stay JSON only', () => {
    const others = decks.filter((s) => !STRUCTURED_DECKS[s.body.deck!.type]);
    expect(new Set(others.map((s) => s.body.deck!.type))).toEqual(
      new Set(['V-YNM', 'V-GN', 'L-PP', 'L-TY', 'L-SP', 'L-AC', 'L-RK', 'V-2T', 'L-TD', 'L-DC', 'L-WJ', 'L-DR', 'D-PV', 'D-WK']),
    );
    for (const s of others) expect(parseStructuredDeck(text(s.body.deck))).toBeNull();
  });

  it('edits q, intro, follow-up and options; keeps every other key in order; checks empty text', () => {
    const deck = { type: 'V-SL', questions: [{ q: 'A?', intro: 'x', scale: { min: 1, max: 5, low: 'No', high: 'Yes' }, softCheck: true }], extra: 1 };
    const d = parseStructuredDeck(text(deck))!;
    d.entries[0] = { ...d.entries[0]!, q: 'B?', intro: '', followUp: 'Why?', pick: ['One', 'Two'] };
    const out = JSON.parse(structuredDeckText(d));
    expect(out).toEqual({ type: 'V-SL', questions: [{ q: 'B?', scale: deck.questions[0]!.scale, softCheck: true, followUp: 'Why?', pick: ['One', 'Two'] }], extra: 1 });
    expect(Object.keys(out.questions[0])).toEqual(['q', 'scale', 'softCheck', 'followUp', 'pick']);
    expect(structuredIssues({ ...d, entries: [...d.entries, emptyQuestion()] })).toBe('Question 2 needs text.');
  });
});

describe('preview deck entries', () => {
  it('lists every entry of every seeded deck that has a playable list', () => {
    const v = decks.find((s) => s.id === 'my-perfect-day')!;
    expect(deckEntries(text(v.body.deck)).length).toBe((v.body.deck!.questions as unknown[]).length);
    const duel = decks.find((s) => s.body.deck!.type === 'L-PP')!;
    expect(deckEntries(text(duel.body.deck)).length).toBe((duel.body.deck!.rounds as unknown[]).length);
  });
});
