import { describe, expect, it } from 'vitest';
import { wordDiff } from './word-diff';

describe('wordDiff', () => {
  it('returns one same part for equal text', () => {
    expect(wordDiff('Listen first.', 'Listen first.')).toEqual([{ kind: 'same', text: 'Listen first.' }]);
  });

  it('marks added and removed words', () => {
    const parts = wordDiff('Listen. Ask one gentle question.', 'Listen. Ask two short questions.');
    expect(parts.filter((p) => p.kind === 'removed').map((p) => p.text.trim())).toEqual(['one gentle question.']);
    expect(parts.filter((p) => p.kind === 'added').map((p) => p.text.trim())).toEqual(['two short questions.']);
    expect(parts.map((p) => (p.kind === 'removed' ? '' : p.text)).join('')).toBe('Listen. Ask two short questions.');
  });
});
