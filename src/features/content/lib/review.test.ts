import { describe, expect, it } from 'vitest';
import { detailsToFieldErrors, isSelfApproval } from './review';

describe('detailsToFieldErrors', () => {
  it('maps the server INVALID_CONTENT details to editor fields and keeps the rest', () => {
    const r = detailsToFieldErrors([
      'catalog.title: 1 to 120 characters',
      'catalog.where: one or more of anywhere, home, out, outside, apart',
      'body.cards[2].text: 1 to 1000 characters',
      'body.steps[0].title: 1 to 200 characters',
      'body.steps[1].body: 1 to 1000 characters',
      'body.cards: at least one card',
      'body.deck: required for a type item',
      'body.need: a list of short lines',
      'catalog.vibes[0]: at most 1000 characters',
      'snapshot: at most 256 KB',
    ]);
    expect(r.mapped.map((m) => m.path)).toEqual([
      'catalog.title',
      'catalog.where',
      'body.cards.2.text',
      'body.steps.0.title',
      'body.steps.1.body',
      'body.cards',
      'body.deckText',
      'body.need',
      'catalog.vibes',
    ]);
    expect(r.mapped[0]!.message).toBe('1 to 120 characters (server)');
    expect(r.unmapped).toEqual(['snapshot: at most 256 KB']);
  });
});

describe('isSelfApproval', () => {
  it('is true only when the approver last edited the draft', () => {
    const draft = { by: 'u1' } as never;
    expect(isSelfApproval({ draft }, 'u1')).toBe(true);
    expect(isSelfApproval({ draft }, 'u2')).toBe(false);
    expect(isSelfApproval({ draft: null }, 'u1')).toBe(false);
    expect(isSelfApproval({ draft }, null)).toBe(false);
  });
});
