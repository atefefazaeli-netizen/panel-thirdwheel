import { describe, expect, it } from 'vitest';
import { changedRows, snapshotDiff } from './diff';

const live = {
  catalog: { id: 'my-perfect-day', title: 'My perfect day', meta: 'Under 5 min', where: ['home'] },
  body: { deck: { type: 'V-TX', questions: [{ q: 'A' }, { q: 'B' }] }, followUp: 'Why?' },
};

describe('snapshotDiff', () => {
  it('reports nothing when the snapshots match', () => {
    expect(changedRows(snapshotDiff(live, structuredClone(live)))).toEqual([]);
  });

  it('finds a changed field, an added deck question and a removed body field', () => {
    const draft = structuredClone(live) as typeof live & { body: { followUp?: string } };
    draft.catalog.title = 'My perfect weekend';
    draft.body.deck.questions[1] = { q: 'B2' };
    draft.body.deck.questions.push({ q: 'C' });
    delete (draft.body as { followUp?: string }).followUp;
    const rows = changedRows(snapshotDiff(live, draft));
    expect(rows.map((r) => [r.path, r.kind])).toEqual([
      ['catalog.title', 'changed'],
      ['body.deck.questions[1]', 'changed'],
      ['body.deck.questions[2]', 'added'],
      ['body.followUp', 'removed'],
    ]);
    expect(rows[0]).toMatchObject({ label: 'title', before: 'My perfect day', after: 'My perfect weekend' });
    expect(rows[2]!.label).toBe('deck › questions 3');
  });

  it('ignores identity fields the server sets and treats a new item as all added', () => {
    const rows = changedRows(snapshotDiff(null, live));
    expect(rows.some((r) => r.path === 'catalog.id')).toBe(false);
    expect(rows.every((r) => r.kind === 'added')).toBe(true);
  });
});
