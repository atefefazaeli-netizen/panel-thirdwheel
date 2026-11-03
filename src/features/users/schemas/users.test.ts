import { describe, expect, it } from 'vitest';
import { grantSchema, normalizeTag, suspendSchema, tagsSchema, usersSearchSchema } from './users';

describe('users schemas', () => {
  it('parses list filters from the URL and drops bad values', () => {
    expect(
      usersSearchSchema.parse({ plan: 'plus', linked: 'true', suspended: false, from: '2026-10-01', page: '2' }),
    ).toEqual({ plan: 'plus', linked: true, suspended: false, from: '2026-10-01', page: 2 });
    expect(usersSearchSchema.parse({ plan: 'trial', from: 'yesterday', limit: 500 })).toEqual({});
  });

  it('suspend needs a reason of 1 to 300 characters', () => {
    expect(suspendSchema.safeParse({ reason: '  ' }).success).toBe(false);
    expect(suspendSchema.safeParse({ reason: 'x'.repeat(301) }).success).toBe(false);
    expect(suspendSchema.safeParse({ reason: 'Spam sign-ups' }).success).toBe(true);
  });

  it('tags: at most 20, each 1 to 32 of a-z, 0-9 and dashes, no repeats', () => {
    expect(tagsSchema.safeParse({ tags: ['beta', 'vip-2026'] }).success).toBe(true);
    expect(tagsSchema.safeParse({ tags: ['Beta'] }).success).toBe(false);
    expect(tagsSchema.safeParse({ tags: ['a'.repeat(33)] }).success).toBe(false);
    expect(tagsSchema.safeParse({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }).success).toBe(false);
    expect(tagsSchema.safeParse({ tags: ['beta', 'beta'] }).success).toBe(false);
    expect(normalizeTag(' Beta Tester ')).toBe('beta-tester');
  });

  it('grant Plus for 1 to 365 whole days with an optional note up to 200', () => {
    expect(grantSchema.safeParse({ days: 0, note: '' }).success).toBe(false);
    expect(grantSchema.safeParse({ days: 366, note: '' }).success).toBe(false);
    expect(grantSchema.safeParse({ days: 2.5, note: '' }).success).toBe(false);
    expect(grantSchema.safeParse({ days: 30, note: 'x'.repeat(201) }).success).toBe(false);
    expect(grantSchema.safeParse({ days: 365, note: 'Press' }).success).toBe(true);
  });
});
