import { describe, expect, it } from 'vitest';
import { ageOn, coupleSpicyLocked } from './spicy';

const now = new Date('2026-11-18T10:00:00Z');

describe('Spicy lock (v2.5.0)', () => {
  it('counts whole years by UTC calendar date', () => {
    expect(ageOn('2008-11-18', now)).toBe(18);
    expect(ageOn('2008-11-19', now)).toBe(17);
    expect(ageOn(null, now)).toBeNull();
    expect(ageOn('not a date', now)).toBeNull();
  });

  it('locks the couple while either partner is under 18 or has no birthday', () => {
    expect(coupleSpicyLocked(['1990-01-01', '1992-05-05'], now)).toBe(false);
    expect(coupleSpicyLocked(['1990-01-01', '2008-11-19'], now)).toBe(true);
    expect(coupleSpicyLocked(['1990-01-01', null], now)).toBe(true);
    expect(coupleSpicyLocked(['2008-11-18'], now)).toBe(false);
    // Unlocks on its own the day the younger partner turns 18.
    expect(coupleSpicyLocked(['1990-01-01', '2008-11-19'], new Date('2026-11-19T00:00:00Z'))).toBe(false);
  });
});
