import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { renderRoute } from '@/test/utils';

const FIGMA = [
  'picking-your-battles',
  'you-or-me-family-duty',
  'you-or-me-extra-spicy',
  'roll-and-play',
  'spin-and-play',
  'date-slots',
  'scratch-and-do',
  'pick-a-card',
  'beat-the-clock',
  'rock-paper-scissors',
];
const filters = () => screen.findByRole('group', { name: 'Filter by source' });
const queue = () => screen.getByRole('list', { name: 'Drafts in review' });

describe('review queue: Round 4 Figma drafts', () => {
  it('seeds the 10 Figma drafts in review and never live (v2.5.2)', () => {
    for (const id of FIGMA) {
      const item = db().content.items.get(id)!;
      expect(item, id).toMatchObject({ live: null, liveVersion: 0, draft: { state: 'in_review', by: 'figma' } });
      expect(item.provenance?.source).toBe('figma-board');
      expect(item.provenance?.needsReview[0]?.reason).toMatch(/^From Figma 1775:7, needs clinician review\./);
    }
    // Merged into their Play games (Spicy Dice G-4-03, Draw Me in 30 G-1-06).
    expect(db().content.items.has('spicy-dice-do')).toBe(false);
    expect(db().content.items.has('draw-it')).toBe(false);
  });

  it('filters by source and shows the provenance, notes and short-deck warning', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/review', { roles: ['content_reviewer'] });
    const group = await filters();
    const figma = await within(group).findByRole('button', { name: 'Figma board 10' });
    await user.click(figma);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ source: 'figma-board' }));
    expect(figma).toHaveAttribute('aria-pressed', 'true');

    const rows = within(queue()).getAllByRole('button');
    expect(rows).toHaveLength(10);
    expect(within(queue()).queryByText('My perfect day')).toBeNull();
    expect(within(queue()).getAllByText('Figma board')).toHaveLength(10);
    // Six sessions outrun their deck: Family Duty, Extra Spicy, Scratch & Do, Pick a Card, Beat the Clock, RPS.
    expect(within(queue()).getAllByText('Deck shorter than the session')).toHaveLength(6);
    // Under 5 cards can't go live: Family Duty 4, Extra Spicy 1, Scratch & Do 3, Beat the Clock 1.
    expect(within(queue()).getAllByText('Too short to go live')).toHaveLength(4);

    await user.click(within(queue()).getByText('Beat the Clock'));
    const pane = await screen.findByText('From the Figma board: needs clinical review');
    expect(pane).toBeInTheDocument();
    expect(screen.getByText(/Not live: the app does not show it until a clinician approves it\./)).toBeInTheDocument();
    expect(screen.getByText('Figma has 1 challenge for 6 rounds.')).toBeInTheDocument();
    expect(
      screen.getByText('Deck shorter than the session: 1 of 6 challenges. They repeat until there are 6.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Board text' })).toHaveTextContent(
      'Name 10 things you love about each other.',
    );

    await user.click(within(group).getByRole('button', { name: /^Release 1 bundle/ }));
    await waitFor(() => expect(within(queue()).queryByText('Beat the Clock')).toBeNull());
    expect(within(queue()).getByText('My perfect day')).toBeInTheDocument();
  });

  it('a clinician approves a Figma draft: it goes live as version 1 with the review flags cleared', async () => {
    const user = userEvent.setup();
    renderRoute('/review?source=figma-board&id=date-slots', { roles: ['content_reviewer'] });
    await screen.findByText('From the Figma board: needs clinical review');
    await user.click(await screen.findByRole('button', { name: 'Approve and publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve and publish' });
    expect(within(dialog).getByText('This clears the clinical review flags')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Approve and publish' }));

    await waitFor(() => expect(db().content.items.get('date-slots')!.liveVersion).toBe(1));
    const item = db().content.items.get('date-slots')!;
    expect(item.draft).toBeNull();
    expect(item.provenance?.needsReview).toEqual([]);
    expect(item.live?.body.deck).toMatchObject({ type: 'date-slots', pulls: 10 });
    // Nothing else went live.
    for (const id of FIGMA.filter((x) => x !== 'date-slots')) expect(db().content.items.get(id)!.live).toBeNull();
  });

  it('DECK_TOO_SHORT: warns before approving, shows the server message and suggests adding cards', async () => {
    const user = userEvent.setup();
    renderRoute('/review?id=beat-the-clock', { roles: ['content_reviewer'] });
    expect(
      await screen.findByText(
        'Too short to go live: 1 of the 5 challenges it needs before a clinician can approve it.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve and publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve and publish' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve and publish' }));

    expect(await screen.findByText('Not approved: the deck is too short')).toBeInTheDocument();
    expect(screen.getByText('This deck has 1 card. Add at least 5 before it goes live.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add cards in the Deck tab' })).toHaveAttribute(
      'href',
      '/content/beat-the-clock?tab=deck',
    );
    expect(screen.queryByRole('dialog', { name: 'Approve and publish' })).toBeNull();
    const item = db().content.items.get('beat-the-clock')!;
    expect(item.live).toBeNull();
    expect(item.draft?.state).toBe('in_review');
  });

  it('a clinician can send a Figma draft back with a note', async () => {
    const user = userEvent.setup();
    renderRoute('/review?id=scratch-and-do', { roles: ['content_reviewer'] });
    await user.click(await screen.findByRole('button', { name: 'Request changes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Request changes' });
    await user.type(within(dialog).getByRole('textbox'), 'Add five more dares before this ships.');
    await user.click(within(dialog).getByRole('button', { name: 'Send back' }));
    await waitFor(() => expect(db().content.items.get('scratch-and-do')!.draft!.state).toBe('changes_requested'));
    expect(db().content.items.get('scratch-and-do')!.live).toBeNull();
  });

  it('a content editor cannot approve or send back a Figma draft', async () => {
    renderRoute('/review?id=roll-and-play', { roles: ['content_editor'] });
    await screen.findByText('From the Figma board: needs clinical review');
    expect(await screen.findByRole('button', { name: 'Approve and publish' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeDisabled();
    expect(db().content.items.get('roll-and-play')!.live).toBeNull();
  });
});
