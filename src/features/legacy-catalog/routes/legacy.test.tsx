import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { renderRoute } from '@/test/utils';

describe('legacy catalog (mock API)', () => {
  it('edits an idea with a live preview and keeps hidden ranking tags', async () => {
    const user = userEvent.setup();
    renderRoute('/catalog', { roles: ['admin'] });
    expect(await screen.findAllByText('Legacy (round 1)')).not.toHaveLength(0);
    await user.click(await screen.findByText('Beginner padel for two'));
    const drawer = await screen.findByRole('dialog');
    const title = within(drawer).getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'Padel for two, beginners');
    expect(
      within(within(drawer).getByLabelText('Card preview')).getByText('Padel for two, beginners'),
    ).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Save idea' }));
    await waitFor(() => expect(db().legacy.items.find((i) => i.id === 1)!.title).toBe('Padel for two, beginners'));
    expect(db().legacy.items.find((i) => i.id === 1)!.tags).toEqual(['active', 'competitive', 'out', 'evening']);
  });

  it('shows the hidden ranking tags from the admin list and adds an idea with the next free id', async () => {
    const user = userEvent.setup();
    db().legacy.retired.add(Math.max(...db().legacy.items.map((i) => i.id)));
    const top = Math.max(...db().legacy.items.map((i) => i.id));
    renderRoute('/catalog', { roles: ['admin'] });
    await user.click(await screen.findByText('Beginner padel for two'));
    const editDrawer = await screen.findByRole('dialog');
    expect(within(editDrawer).getByText('competitive')).toBeInTheDocument();
    await user.click(within(editDrawer).getByRole('button', { name: 'Cancel' }));

    await user.click(await screen.findByRole('button', { name: /New idea/ }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByRole('spinbutton', { name: 'Id' })).toHaveValue(null);
    await user.type(within(drawer).getByRole('textbox', { name: 'Title' }), 'Night swim');
    await user.type(within(drawer).getByRole('textbox', { name: /Why it fits/ }), 'Warm night.');
    await user.type(within(drawer).getByRole('textbox', { name: /Meta/ }), '1 hour');
    await user.click(within(drawer).getByRole('button', { name: 'Add idea' }));
    // After every id ever used, the retired one included: no collision with a hidden id.
    await waitFor(() => expect(db().legacy.items.find((i) => i.title === 'Night swim')?.id).toBe(top + 1));
  });

  it('adds and retires an experience', async () => {
    const user = userEvent.setup();
    renderRoute('/experiences', { roles: ['admin'] });
    await user.click(await screen.findByRole('button', { name: 'New experience' }));
    const drawer = await screen.findByRole('dialog');
    await user.type(within(drawer).getByRole('textbox', { name: 'Id' }), 'x-sunset-walk');
    await user.type(within(drawer).getByRole('textbox', { name: 'Title' }), 'Sunset walk');
    await user.type(within(drawer).getByRole('textbox', { name: 'Meta line' }), 'Together · 30 min');
    await user.type(within(drawer).getByRole('textbox', { name: 'Why it fits' }), 'A slow end to a busy day.');
    await user.click(within(drawer).getByRole('button', { name: 'Add experience' }));
    await waitFor(() => expect(db().legacy.experiences.some((x) => x.id === 'x-sunset-walk')).toBe(true));
  });
});
