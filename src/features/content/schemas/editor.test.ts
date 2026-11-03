import { describe, expect, it } from 'vitest';
import seed from '@/mocks/data/content-seed.json';
import type { ContentSnapshot } from '../api/types';
import {
  cardFromForm,
  cardToForm,
  deckIssues,
  editorSchema,
  formToSnapshot,
  snapshotToForm,
  stepFromForm,
  stepToForm,
} from './editor';

type SeedItem = { id: string; kind: string; catalog: ContentSnapshot['catalog']; body: ContentSnapshot['body'] };
const items = seed as unknown as SeedItem[];

describe('editor codec', () => {
  it('round-trips every seeded Release 1 item unchanged (same JSON, same key order)', () => {
    for (const it of items) {
      const snap: ContentSnapshot = { catalog: it.catalog, body: it.body };
      const back = formToSnapshot(snapshotToForm(snap));
      expect(JSON.stringify(back), it.id).toBe(JSON.stringify(snap));
    }
  });

  it('every seeded item passes the editor schema for its kind', () => {
    for (const it of items) {
      const r = editorSchema(it.kind).safeParse(snapshotToForm({ catalog: it.catalog, body: it.body }));
      expect(r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`), it.id).toEqual([]);
    }
  });

  it('drops cleared optional card fields and keeps unknown keys', () => {
    const form = cardToForm({ text: 'Q?', intro: 'If relevant', pick: ['A', 'B'], custom: 7 });
    const out = cardFromForm({ ...form, intro: '', pick: [], softCheck: true });
    expect(out).toEqual({ text: 'Q?', custom: 7, softCheck: true });
  });

  it('writes Do step fields and leaves empty ones out', () => {
    const out = stepFromForm({
      ...stepToForm({ title: 'Knead', body: 'Take turns.' }),
      minutes: 8,
      swapAt: 4,
      swap: { verb: 'kneads', verbIng: 'kneading', object: 'the dough' },
    });
    expect(out).toEqual({
      title: 'Knead',
      body: 'Take turns.',
      minutes: 8,
      swapAt: 4,
      swap: { verb: 'kneads', verbIng: 'kneading', object: 'the dough' },
    });
  });

  it('applies an edited title and a new card', () => {
    const it0 = items.find((i) => i.kind === 'quiz-turn')!;
    const form = snapshotToForm({ catalog: it0.catalog, body: it0.body });
    form.catalog.title = 'New title';
    form.body.cards.push(cardToForm({ text: 'Another card' }));
    const out = formToSnapshot(form);
    expect(out.catalog.title).toBe('New title');
    expect(out.body.cards!.at(-1)).toEqual({ text: 'Another card' });
    expect(out.body.cards!.length).toBe(it0.body.cards!.length + 1);
  });
});

describe('editor rules', () => {
  const base = snapshotToForm({ catalog: { title: 'T', where: ['home'], category: 'laughs', minutes: 10 }, body: {} });

  it('rejects an empty title, no Where and minutes out of range', () => {
    const bad = { ...base, catalog: { ...base.catalog, title: ' ', where: [], minutes: 20000 } };
    const r = editorSchema('do-home').safeParse(bad);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['catalog.title', 'catalog.where', 'catalog.minutes']));
  });

  it('allows week-long Do cards (10080 minutes)', () => {
    expect(editorSchema('do-home').safeParse({ ...base, catalog: { ...base.catalog, minutes: 10080 } }).success).toBe(
      true,
    );
  });

  it('needs a deck with a type for type items', () => {
    expect(deckIssues('', true)).toMatch(/deck/);
    expect(deckIssues('{"rounds": []}', true)).toMatch(/type/);
    expect(deckIssues('{"type": "V-YNM"', true)).toMatch(/not valid JSON/);
    expect(deckIssues('{"type": "V-YNM"}', true)).toBeNull();
    expect(editorSchema('type-quiz').safeParse(base).success).toBe(false);
  });

  it('needs at least one card for Your turn and Card deck quizzes', () => {
    const r = editorSchema('quiz-turn').safeParse(base);
    expect(r.success).toBe(false);
    expect(
      editorSchema('quiz-turn').safeParse({ ...base, body: { ...base.body, cards: [cardToForm({ text: 'Q' })] } })
        .success,
    ).toBe(true);
  });

  it('limits card text to 1000 characters', () => {
    const long = cardToForm({ text: 'x'.repeat(1001) });
    expect(editorSchema('quiz-deck').safeParse({ ...base, body: { ...base.body, cards: [long] } }).success).toBe(false);
  });
});
