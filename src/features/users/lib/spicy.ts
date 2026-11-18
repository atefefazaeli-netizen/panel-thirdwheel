// Spicy lock (app v2.5.0, backend libs/common domain/spicy.ts). Under-18 accounts are not blocked;
// while anyone in a couple is under 18 by their birthday (a missing birthday counts too), Spicy is
// locked: off for both and no switch turns it on. Never stored: derived from the birthdays on every
// read, so it lifts on its own. The panel shows it read-only and never says who or why: the app
// itself only says "Spicy can't be turned on".

const SPICY_MIN_AGE = 18;

/** Whole years from a birthday to `now`, by UTC calendar date (the backend's `ageOn`). */
export function ageOn(birthday: string | null | undefined, now: Date): number | null {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (Number.isNaN(b.getTime()) || Number.isNaN(now.getTime())) return null;
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

/** The backend's `coupleSpicyLocked`: pass your birthday and, when linked, your partner's. */
export function coupleSpicyLocked(birthdays: readonly (string | null | undefined)[], now: Date = new Date()): boolean {
  return birthdays.some((b) => {
    const age = ageOn(b, now);
    return age === null || age < SPICY_MIN_AGE;
  });
}

/** What staff may say: no names, no ages. */
export const SPICY_LOCKED_HELP =
  'Off for both partners and it can’t be turned on. Worked out from the couple’s birthdays on every read; it unlocks on its own. The app only says “Spicy can’t be turned on.”';
