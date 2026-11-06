import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { renderRoute } from '@/test/utils';

const bar = () => screen.findByRole('region', { name: 'Workflow' });
const buttonNames = (el: HTMLElement) =>
  within(el)
    .queryAllByRole('button')
    .map((b) => b.textContent?.trim())
    .sort();

describe('content item editor (mock API)', () => {
  it('a content reviewer sees Approve, Request changes and Unpublish on a draft in review (no editing), and approves it', async () => {
    const user = userEvent.setup();
    renderRoute('/content/my-perfect-day', { roles: ['content_reviewer'] });
    const b = await bar();
    expect(buttonNames(b)).toEqual(['Approve and publish', 'Request changes', 'Unpublish']);
    expect(screen.getByText('Read only')).toBeInTheDocument();

    await user.click(within(b).getByRole('button', { name: 'Approve and publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve and publish' });
    await user.type(within(dialog).getByRole('textbox'), 'Reads well.');
    await user.click(within(dialog).getByRole('button', { name: 'Approve and publish' }));

    await waitFor(() => expect(db().content.items.get('my-perfect-day')!.liveVersion).toBe(3));
    expect(db().content.items.get('my-perfect-day')!.draft).toBeNull();
    expect(await screen.findByText(/Live v3\. No draft\./)).toBeInTheDocument();
  });

  it('request changes needs a note', async () => {
    const user = userEvent.setup();
    renderRoute('/content/my-perfect-day', { roles: ['content_reviewer'] });
    const b = await bar();
    await user.click(within(b).getByRole('button', { name: 'Request changes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Request changes' });
    await user.click(within(dialog).getByRole('button', { name: 'Send back' }));
    expect(await within(dialog).findByText('Say what needs to change.')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox'), 'Card 3 needs a softer tone.');
    await user.click(within(dialog).getByRole('button', { name: 'Send back' }));
    await waitFor(() => expect(db().content.items.get('my-perfect-day')!.draft!.state).toBe('changes_requested'));
  });

  it('a content editor: no approve and no unpublish; saves an edit as a draft and submits it', async () => {
    const user = userEvent.setup();
    renderRoute('/content/blind-taste-test', { roles: ['content_editor'] });
    const b = await bar();
    expect(buttonNames(b)).toEqual(['Save draft', 'Submit for review']);
    expect(within(b).getByRole('button', { name: 'Save draft' })).toBeDisabled();

    const title = screen.getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'Blind taste test: snacks');
    expect(await screen.findByText('Unsaved changes.')).toBeInTheDocument();
    await user.click(within(b).getByRole('button', { name: 'Save draft' }));

    await waitFor(() =>
      expect(db().content.items.get('blind-taste-test')!.draft?.snapshot.catalog.title).toBe(
        'Blind taste test: snacks',
      ),
    );
    const last = db()
      .content.changes.filter((c) => c.itemId === 'blind-taste-test')
      .at(-1)!;
    expect(last).toMatchObject({ action: 'draft_saved', meta: { summary: ['catalog.title'] } });

    await user.click(await within(b).findByRole('button', { name: 'Submit for review' }));
    const dialog = await screen.findByRole('dialog', { name: 'Submit for review' });
    await user.click(within(dialog).getByRole('button', { name: 'Submit for review' }));
    await waitFor(() => expect(db().content.items.get('blind-taste-test')!.draft?.state).toBe('in_review'));
    expect(buttonNames(b)).not.toContain('Approve and publish');
  });

  it('blocks saving an invalid draft (empty title)', async () => {
    const user = userEvent.setup();
    renderRoute('/content/blind-taste-test', { roles: ['content_editor'] });
    const b = await bar();
    await user.clear(screen.getByRole('textbox', { name: 'Title' }));
    expect(await screen.findByText('Title is required.')).toBeInTheDocument();
    expect(within(b).getByRole('button', { name: 'Save draft' })).toBeDisabled();
  });

  it('retired items offer Restore (content.unpublish)', async () => {
    renderRoute('/content/phone-stack', { roles: ['content_reviewer'] });
    const b = await bar();
    expect(buttonNames(b)).toContain('Restore');
    expect(buttonNames(b)).not.toContain('Unpublish');
  });
});
