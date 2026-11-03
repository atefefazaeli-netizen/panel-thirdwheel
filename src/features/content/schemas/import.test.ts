import { describe, expect, it } from 'vitest';
import { parseImport } from './import';

const good = {
  id: 'my-perfect-day',
  code: 'Q-2-01',
  pillar: 'quiz',
  kind: 'type-quiz',
  catalog: { title: 'My perfect day', where: ['home'] },
  body: { deck: { type: 'V-TX', questions: [] } },
};

describe('parseImport', () => {
  it('accepts an array and the { items } body', () => {
    expect(parseImport([good])).toMatchObject({ ok: true, rows: [{ id: 'my-perfect-day', problems: [] }] });
    expect(parseImport({ items: [good] })).toMatchObject({ ok: true });
  });

  it('rejects non-lists, empty lists and more than 200 items', () => {
    expect(parseImport({ nope: 1 })).toMatchObject({ ok: false });
    expect(parseImport([])).toMatchObject({ ok: false });
    expect(parseImport(Array.from({ length: 201 }, (_, i) => ({ ...good, id: `x-${i}` })))).toMatchObject({
      ok: false,
      error: expect.stringContaining('200'),
    });
  });

  it('flags item problems one by one and keeps the valid ones', () => {
    const res = parseImport([
      good,
      { ...good, id: 'Bad Id' },
      { ...good, id: 'needs-deck', body: {} },
      { ...good, id: 'turn', kind: 'quiz-turn', body: { cards: [] } },
      { ...good, id: 'wrong-pillar', pillar: 'do' },
      { ...good, id: 'my-perfect-day' },
    ]);
    if (!res.ok) throw new Error('expected ok');
    const by = Object.fromEntries(res.rows.map((r) => [r.id, r.problems]));
    expect(by['Bad Id']![0]).toMatch(/^id:/);
    expect(by['needs-deck']).toContain('body.deck: required for a type item, with a type');
    expect(by.turn).toContain('body.cards: at least one card');
    expect(by['wrong-pillar']![0]).toMatch(/not a do kind/);
    expect(res.rows[5]!.problems).toContain('Listed twice in this import');
    expect(res.rows.filter((r) => r.item).length).toBe(1);
  });
});
