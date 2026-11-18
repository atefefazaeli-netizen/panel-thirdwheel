import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import seeded from '@/mocks/data/content-figma-drafts.json';
import merged from '@/test/fixtures/merged-figma-drafts.json';
import type { ContentSnapshot } from '../api/types';
import { boardOfSnapshot, type BoardDeck } from '../lib/boards';
import { BoardDeckEditor } from './board-deck-editor';

type Json = Record<string, unknown>;
const start = (code: string) => {
  const d = ([...seeded, ...merged] as unknown as (ContentSnapshot & { code: string })[]).find((x) => x.code === code)!;
  return boardOfSnapshot(structuredClone(d))!;
};

/** The editor with its deck held in state, like the Deck tab does; `latest` is the deck as saved. */
function setup(code: string, opts: { readOnly?: boolean; onOpenCards?: () => void } = {}) {
  const first = start(code);
  const latest: { deck: Json } = { deck: first.board.deck };
  function Harness() {
    const [deck, setDeck] = React.useState<Json>(first.board.deck);
    const board: BoardDeck = { type: first.board.type, deck };
    return (
      <BoardDeckEditor
        board={board}
        cards={first.cards}
        readOnly={!!opts.readOnly}
        onOpenCards={opts.onOpenCards}
        onChange={(d) => {
          latest.deck = d;
          setDeck(d);
        }}
      />
    );
  }
  render(<Harness />);
  return { user: userEvent.setup(), latest, original: first.board.deck };
}
const list = (name: RegExp) => screen.getByRole('group', { name });

describe('board deck editor', () => {
  it('Spicy Dice: skin select, re-rolls switch and number bounds', async () => {
    const { user, latest } = setup('D-4-08');
    const skin = screen.getByLabelText('Skin');
    expect(skin).toHaveValue('spicy');
    await user.selectOptions(skin, 'light');
    expect(latest.deck.skin).toBe('light');

    // Spicy Dice has no re-rolls (null): the number is off until the switch is turned off.
    const rerolls = screen.getByLabelText(/^Re-rolls/);
    expect(rerolls).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: 'No re-rolls' }));
    expect(latest.deck.rerolls).toBe(0);
    await user.clear(rerolls);
    await user.type(rerolls, '12');
    expect(latest.deck.rerolls).toBe(12);
    expect(
      within(screen.getByRole('list', { name: 'Board problems' })).getByText('Re-rolls: a whole number from 0 to 10.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Rolls per session/)).toHaveAttribute('max', '50');
  });

  it('removes, adds and reorders list items, keeping fields it does not know', async () => {
    const { user, latest, original } = setup('D-2-05');
    const slices = () => latest.deck.slices as { label: string }[];
    const firstTwo = (original.slices as { label: string }[]).slice(0, 2).map((s) => s.label);

    await user.click(within(list(/Wheel slices/)).getByRole('button', { name: 'Move Slice 1 down' }));
    expect(
      slices()
        .slice(0, 2)
        .map((s) => s.label),
    ).toEqual([firstTwo[1], firstTwo[0]]);
    await user.click(within(list(/Wheel slices/)).getByRole('button', { name: 'Remove Slice 8' }));
    expect(slices()).toHaveLength(7);
    await user.click(within(list(/Wheel slices/)).getByRole('button', { name: 'Add slice' }));
    expect(slices()).toHaveLength(8);
    expect(screen.getByText(/Slice 8, Label on the wheel: needed\./, { selector: 'li' })).toBeInTheDocument();
    // Untouched keys stay, in their original order.
    expect(Object.keys(latest.deck)).toEqual(Object.keys(original));
    expect(latest.deck.hint).toBe(original.hint);
  });

  it('a die is full at six faces', () => {
    setup('D-1-05');
    expect(within(list(/Action die/)).getByRole('button', { name: 'Add action' })).toBeDisabled();
    expect(within(list(/Topic die/)).getByRole('button', { name: 'Add topic' })).toBeDisabled();
  });

  it('warns when a deck is shorter than its session and adds a card from the warning', async () => {
    const { user, latest } = setup('D-3-07');
    expect(
      screen.getByText('Deck shorter than the session: 1 of 6 challenges. They repeat until there are 6.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add one' }));
    expect(latest.deck.challenges).toEqual([(start('D-3-07').board.deck.challenges as string[])[0], '']);
    await user.type(screen.getByRole('textbox', { name: 'Challenge 2' }), 'Name 5 places you want to go.');
    expect(screen.getByText(/2 of 6 challenges/)).toBeInTheDocument();
  });

  it('You or Me sends the editor to the Cards tab for more questions', async () => {
    const opened: string[] = [];
    const { user } = setup('Q-5-22', { onOpenCards: () => opened.push('cards') });
    expect(screen.getByText(/4 of 10 questions/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add questions in the Cards tab' }));
    expect(opened).toEqual(['cards']);
  });

  it('read only: no add, remove or warning actions', () => {
    setup('D-5-09', { readOnly: true });
    expect(screen.getByText(/3 of 8 dares/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add|Remove|Move/ })).toBeNull();
  });
});
