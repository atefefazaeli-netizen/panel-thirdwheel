import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { renderRoute } from '@/test/utils';

describe('users (mock API)', () => {
  it('filters by plan from the URL and lists Sara with her partner', async () => {
    renderRoute('/users?plan=plus&q=sara');
    const table = await screen.findByRole('table', { name: 'Users' });
    expect(await within(table).findByText('Sara')).toBeInTheDocument();
    expect(within(table).getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('1 result')).toBeInTheDocument();
  });

  it('clinicians cannot open users', async () => {
    renderRoute('/users', { roles: ['clinician'] });
    expect(await screen.findByText('Not available for your role')).toBeInTheDocument();
  });

  it('suspends with a reason and shows the banner', async () => {
    const user = userEvent.setup();
    renderRoute('/users/usr_maya');
    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Suspend' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await within(dialog).findByText('Give a reason.')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox'), 'Harassment reports');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText(/Harassment reports/)).toBeInTheDocument();
    expect(db().users.get('usr_maya')!.account.suspended).toBe(true);
  });

  it('grants Plus to a linked account and carries it to the partner', async () => {
    const user = userEvent.setup();
    const target = [...db().users.values()].find(
      (u) => u.couple && u.subscription.state === 'free' && !u.account.roles.length,
    )!;
    renderRoute(`/users/${target.account.userId}`);
    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Grant Plus' }));
    const dialog = await screen.findByRole('dialog');
    const days = within(dialog).getByRole('spinbutton', { name: 'Days' });
    await user.clear(days);
    await user.type(days, '400');
    await user.click(within(dialog).getByRole('button', { name: 'Grant Plus' }));
    expect(await within(dialog).findByText('At most 365 days.')).toBeInTheDocument();
    await user.clear(days);
    await user.type(days, '14');
    await user.click(within(dialog).getByRole('button', { name: 'Grant Plus' }));
    await waitFor(() => expect(db().users.get(target.account.userId)!.subscription.plus).toBe(true));
    expect(db().users.get(target.couple!.partnerId)!.subscription.state).toBe('paid_by_partner');
  });

  it('deletes only after the email is typed', async () => {
    const user = userEvent.setup();
    renderRoute('/users/usr_omar');
    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete account' }));
    const dialog = await screen.findByRole('alertdialog');
    const del = within(dialog).getByRole('button', { name: 'Delete account' });
    expect(del).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox'), db().users.get('usr_omar')!.account.email!);
    await user.click(del);
    await waitFor(() => expect(db().users.has('usr_omar')).toBe(false));
  });
});
