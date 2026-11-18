import { describe, expect, it } from 'vitest';
import seeded from '@/mocks/data/content-figma-drafts.json';
import merged from '@/test/fixtures/merged-figma-drafts.json';
import type { ContentSnapshot } from '../api/types';
import { deckIssues, formToSnapshot, snapshotToForm } from '../schemas/editor';
import {
  BOARD_TYPES,
  boardDeckText,
  boardIssues,
  boardOfSnapshot,
  boardPreview,
  deckSize,
  goLiveShortfall,
  isBoardType,
  MIN_DECK_CARDS,
  parseBoardDeck,
  sessionShortfalls,
  setAt,
  shortfallText,
  splitBlank,
  type BoardDeck,
} from './boards';

type Draft = { id: string; code: string; catalog: ContentSnapshot['catalog']; body: ContentSnapshot['body'] };
// The 10 seeded drafts (v2.5.2) plus the two merged into their Play games (D-4-08, D-1-07), whose
// boards (spicy Roll & Play, Draw It) the published games now use.
const all = [...seeded, ...merged] as unknown as Draft[];
const draft = (code: string) => all.find((d) => d.code === code)!;
const boardOf = (code: string) => boardOfSnapshot(draft(code))!;
const withDeck = (code: string, fn: (deck: Record<string, unknown>) => Record<string, unknown>): BoardDeck => {
  const b = boardOf(code).board;
  return { type: b.type, deck: fn(structuredClone(b.deck)) };
};
const messages = (b: BoardDeck, cards: string[] = []) => boardIssues(b, cards).map((p) => p.message);

describe('board decks (Round 4 Figma drafts)', () => {
  it('reads every Figma draft as a board deck named after its screen, with no blocking problem', () => {
    expect(seeded).toHaveLength(10);
    expect(all).toHaveLength(12);
    for (const d of all) {
      const b = boardOfSnapshot(d);
      expect(b, d.code).not.toBeNull();
      expect(b!.board.type).toBe(d.catalog.screen);
      expect(isBoardType(b!.board.type)).toBe(true);
      expect(boardIssues(b!.board, b!.cards), d.code).toEqual([]);
      expect(boardPreview(b!.board, b!.cards).length, d.code).toBeGreaterThan(0);
    }
    expect(new Set(all.map((d) => d.catalog.screen))).toEqual(new Set(BOARD_TYPES));
  });

  it('flags exactly the decks shorter than their session', () => {
    const short = Object.fromEntries(
      all.map((d) => {
        const b = boardOfSnapshot(d)!;
        return [d.code, sessionShortfalls(b.board, b.cards.length).map((s) => [s.have, s.need, s.deckName ?? null])];
      }),
    );
    expect(short).toEqual({
      'Q-3-18': [],
      'Q-5-22': [[4, 10, null]],
      'Q-4-10': [[1, 10, null]],
      'D-1-05': [],
      'D-4-08': [],
      'D-2-05': [],
      'D-1-06': [],
      'D-5-09': [[3, 8, null]],
      'D-6-04': [[2, 6, 'Act it out']],
      'D-3-07': [[1, 6, null]],
      'D-1-07': [],
      'D-1-08': [[1, 10, null]],
    });
    const scratch = boardOf('D-5-09');
    expect(shortfallText(sessionShortfalls(scratch.board)[0]!)).toBe(
      'Deck shorter than the session: 3 of 8 dares. They repeat until there are 8.',
    );
    const pick = boardOf('D-6-04');
    expect(shortfallText(sessionShortfalls(pick.board)[0]!)).toMatch(
      /^Act it out: deck shorter than the session: 2 of 6 words/,
    );
  });

  it('Roll & Play: six faces per die, re-rolls 0 to 10 or none, skin Light or Spicy', () => {
    expect(messages(withDeck('D-1-05', (d) => ({ ...d, actions: (d.actions as unknown[]).slice(0, 5) })))).toEqual([
      'Action die: exactly 6 (now 5). A die has six faces.',
    ]);
    expect(messages(withDeck('D-1-05', (d) => ({ ...d, rerolls: 11 })))).toEqual([
      'Re-rolls: a whole number from 0 to 10.',
    ]);
    expect(messages(withDeck('D-1-05', (d) => ({ ...d, rerolls: null })))).toEqual([]);
    expect(messages(withDeck('D-1-05', (d) => ({ ...d, skin: 'neon' })))).toEqual(['Skin: one of Light, Spicy.']);
    expect(messages(withDeck('D-4-08', (d) => setAt(d, ['actions', 2, 'prompt'], '  ')))).toEqual([
      'Action 3, What to do: needed.',
    ]);
  });

  it('Date Slots: the result sentence names only reels that exist', () => {
    expect(messages(withDeck('D-1-06', (d) => ({ ...d, template: '{move} {when}' })))).toEqual([
      'Result sentence: {when} is not a reel name.',
    ]);
  });

  it('Fill the blank: every card needs a blank; words 2 to 10', () => {
    const b = boardOf('Q-3-18');
    expect(messages(b.board, [...b.cards, 'No blank here'])).toEqual(['Card 6: needs a blank (___) to fill.']);
    expect(
      messages(
        withDeck('Q-3-18', (d) => ({ ...d, words: ['Always'] })),
        b.cards,
      ),
    ).toEqual(['Words to fill the blank: at least 2.']);
  });

  it('Draw It, Pick a Card and You or Me cross checks', () => {
    expect(messages(withDeck('D-1-07', (d) => ({ ...d, words: ['A', 'B'] })))).toContain(
      'Words to draw: at least as many as the answers to choose from (4).',
    );
    expect(messages(withDeck('D-6-04', (d) => ({ ...d, cards: (d.cards as unknown[]).slice(0, 2) })))).toContain(
      'Cards: at least as many as are dealt per round (3).',
    );
    expect(messages(withDeck('Q-5-22', (d) => ({ ...d, answers: ['{me}'] })))).not.toEqual([]);
  });

  it('setAt changes one value and keeps unknown keys and their order', () => {
    const deck = { type: 'beat-the-clock', zz: { keep: 1 }, rounds: 6, challenges: ['a'], extra: [1, 2] };
    const next = setAt(deck, ['challenges', 1], 'b');
    expect(next).toEqual({ ...deck, challenges: ['a', 'b'] });
    expect(Object.keys(next)).toEqual(Object.keys(deck));
    expect(deck.challenges).toEqual(['a']);
    expect(Object.keys(setAt(deck, ['subtitle'], undefined))).toEqual(Object.keys(deck));
  });

  it('round-trips a board deck through the editor form untouched (unknown fields included)', () => {
    for (const d of all) {
      const snap: ContentSnapshot = structuredClone({ catalog: d.catalog, body: d.body });
      (snap.body.deck as Record<string, unknown>).futureField = { from: 'a later app release' };
      const form = snapshotToForm(snap);
      expect(parseBoardDeck(form.body.deckText)?.type).toBe(d.catalog.screen);
      expect(formToSnapshot(form)).toEqual(snap);
    }
  });

  it('the deck error blocks saving an invalid board and passes a valid one', () => {
    const b = boardOf('D-1-08');
    expect(deckIssues(boardDeckText(b.board.deck), true)).toBeNull();
    expect(deckIssues(boardDeckText({ ...b.board.deck, rounds: 0 }), true)).toBe(
      'Rounds: a whole number from 1 to 30.',
    );
  });

  it('Fill the blank keeps before and after in step with an edited card', () => {
    expect(splitBlank('We ___ talk.')).toEqual({ before: 'We', after: 'talk.' });
    const d = draft('Q-3-18');
    const form = snapshotToForm(structuredClone({ catalog: d.catalog, body: d.body }));
    form.body.cards[0]!.text = 'We ___ laugh about it later.';
    const card = formToSnapshot(form).body.cards![0]!;
    expect(card).toMatchObject({ text: 'We ___ laugh about it later.', before: 'We', after: 'laugh about it later.' });
  });

  it('counts a deck the way approve does (409 DECK_TOO_SHORT under 5)', () => {
    const sizes = Object.fromEntries(all.map((d) => [d.code, deckSize(d.body)]));
    expect(sizes).toEqual({
      'Q-3-18': 5,
      'Q-5-22': 4,
      'Q-4-10': 1,
      'D-1-05': 6,
      'D-2-05': 8,
      'D-1-06': 6,
      'D-5-09': 3,
      'D-6-04': 6,
      'D-3-07': 1,
      'D-1-08': null, // Rock Paper Scissors is exempt
      'D-4-08': 6,
      'D-1-07': null, // Draw It is not a counted board
    });
    expect(MIN_DECK_CARDS).toBe(5);
    expect(
      deckSize({ deck: { type: 'date-slots', reels: [{ words: ['a', 'b', 'c', 'd', 'e'] }, { words: ['x'] }] } }),
    ).toBe(1);
    expect(deckSize({ deck: { type: 'V-TX' }, cards: [] })).toBeNull();
    expect(goLiveShortfall(draft('D-5-09').body)?.text).toBe(
      'Too short to go live: 3 of the 5 dares it needs before a clinician can approve it.',
    );
    expect(goLiveShortfall(draft('Q-5-22').body)?.what).toBe('questions (Cards tab)');
    expect(goLiveShortfall(draft('D-1-08').body)).toBeNull();
  });

  it('previews with sample names, counts, an example roll and the session length', () => {
    const text = (code: string) =>
      boardPreview(boardOf(code).board, boardOf(code).cards)
        .map((s) => `${s.title}: ${s.lines.join(' | ')}`)
        .join('\n');
    for (const d of all) expect(text(d.code), d.code).not.toMatch(/\{(me|p|loser|topic|n)\}/);
    expect(text('D-1-05')).toContain(
      'Example roll: Tell + First date: Tell Alex about your first date, from your side.',
    );
    expect(text('D-1-05')).toContain('Session: 12 rolls · 2 re-rolls');
    expect(text('D-4-08')).toContain('Session: 12 rolls · No re-rolls · Spicy skin');
    expect(text('D-1-06')).toContain('Example pull: Slow dance, in the kitchen, for 10 seconds.');
    expect(text('D-2-05')).toContain('Wheel slices (8): Compliment: Give Alex a compliment');
    expect(text('Q-5-22')).toContain('Answers: Sara · Alex · Both · Neither');
    expect(text('D-1-08')).toContain('Lines: Sara loses. Sara does it.');
    expect(text('D-6-04')).toContain('Act it out (2 of 6 words)');
    expect(text('D-3-07')).toContain('Session: 6 rounds · 60 seconds each · target 10');
  });
});
