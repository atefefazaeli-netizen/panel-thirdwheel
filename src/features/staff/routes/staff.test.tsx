import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { staffId } from '@/mocks/data/staff';
import { db } from '@/mocks/db';
import { server } from '@/mocks/node';
import { p } from '@/mocks/utils';
import { renderRoute } from '@/test/utils';

const account = (username: string) => db().staff.accounts.find((a) => a.username === username)!;

describe('staff accounts (Owner, mock API)', () => {
  it('lists staff with roles, status, two-factor and temporary passwords', async () => {
    renderRoute('/staff', { roles: ['owner'] });
    const table = await screen.findByRole('table', { name: 'Staff accounts' });
    await within(table).findByText('Yousef Ali');
    const temp = within(table).getByText('Karim Haddad').closest('tr')!;
    expect(within(temp).getByText('Temporary password')).toBeInTheDocument();
    const former = within(table).getByText('Former Editor').closest('tr')!;
    expect(within(former).getByText('Disabled')).toBeInTheDocument();
  });

  it('creates an account and shows the temporary password once', async () => {
    const user = userEvent.setup();
    renderRoute('/staff', { roles: ['owner'] });
    await user.click(await screen.findByRole('button', { name: 'Add staff' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a staff account' });
    await user.type(within(dialog).getByLabelText('Username'), 'Bad Name');
    await user.type(within(dialog).getByLabelText('Name'), 'Lina Saad');
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }));
    expect(await within(dialog).findByText(/3 to 40 characters/)).toBeInTheDocument();
    expect(within(dialog).getByText('Choose at least one role.')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Username'));
    await user.type(within(dialog).getByLabelText('Username'), 'lina.saad');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Support agent' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }));

    const reveal = await screen.findByRole('dialog', { name: 'Temporary password for Lina Saad' });
    const created = account('lina.saad');
    expect(created).toMatchObject({ roles: ['support_agent'], mustChangePassword: true });
    const field = within(reveal).getByLabelText('Temporary password') as HTMLInputElement;
    expect(field.value).toBe(created.password);
    await user.click(within(reveal).getByRole('button', { name: 'I handed it over' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Temporary password/ })).toBeNull());
    // Once: nothing on the page shows it any more.
    expect(screen.queryByDisplayValue(created.password)).toBeNull();
  });

  it('USERNAME_TAKEN reads clearly', async () => {
    const user = userEvent.setup();
    renderRoute('/staff', { roles: ['owner'] });
    await user.click(await screen.findByRole('button', { name: 'Add staff' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a staff account' });
    await user.type(within(dialog).getByLabelText('Username'), 'editor');
    await user.type(within(dialog).getByLabelText('Name'), 'Someone');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Read-only analyst' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }));
    expect(await within(dialog).findByText('That username is taken.')).toBeInTheDocument();
    expect(db().staff.accounts.filter((a) => a.username === 'editor')).toHaveLength(1);
  });

  it('own account: roles cannot be changed here (checkboxes disabled) and there is no disable or reset', async () => {
    const user = userEvent.setup();
    renderRoute(`/staff?id=${staffId('test.owner')}`, { roles: ['owner'] });
    const drawer = await screen.findByRole('dialog', { name: 'Test owner' });
    expect(within(drawer).getByText(/This is your account/)).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Disable' })).toBeNull();
    expect(within(drawer).queryByRole('button', { name: 'Reset password' })).toBeNull();
    await user.click(within(drawer).getByRole('button', { name: 'Edit name' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit your name' });
    expect(within(dialog).getByRole('checkbox', { name: 'Owner' })).toBeDisabled();
    expect(within(dialog).getByText('You cannot change your own roles. Ask another Owner.')).toBeInTheDocument();
  });

  it('SELF_ROLE_CHANGE from the server reads clearly (the API refuses a self role change)', async () => {
    const user = userEvent.setup();
    renderRoute(`/staff?id=${staffId('editor')}`, { roles: ['owner'] });
    server.use(
      http.patch(p('admin/staff/:id'), () =>
        HttpResponse.json({ statusCode: 409, message: 'x', code: 'SELF_ROLE_CHANGE' }, { status: 409 }),
      ),
    );
    const drawer = await screen.findByRole('dialog', { name: 'Huda Karim' });
    await user.click(within(drawer).getByRole('button', { name: 'Edit name and roles' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Huda Karim' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'Content reviewer' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('You cannot change your own roles. Ask another Owner.', {
        selector: '[data-slot=alert-description]',
      }),
    ).toBeInTheDocument();
  });

  it('changes roles of someone else: their sessions end (mock mirrors the API)', async () => {
    const user = userEvent.setup();
    db().staff.sessions.set('sid_editor', {
      id: 'sid_editor',
      staffId: staffId('editor'),
      csrfToken: 'x',
      restricted: null,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      userAgent: 'Other browser',
    });
    renderRoute(`/staff?id=${staffId('editor')}`, { roles: ['owner'] });
    const drawer = await screen.findByRole('dialog', { name: 'Huda Karim' });
    await user.click(within(drawer).getByRole('button', { name: 'Edit name and roles' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Huda Karim' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'Content reviewer' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(account('editor').roles).toEqual(['content_editor', 'content_reviewer']));
    expect(db().staff.sessions.has('sid_editor')).toBe(false);
  });

  it('LAST_OWNER: removing the last active Owner is refused with clear copy', async () => {
    const user = userEvent.setup();
    // Only one other active Owner left besides the test Owner; the server says no anyway.
    server.use(
      http.post(p('admin/staff/:id/disable'), () =>
        HttpResponse.json({ statusCode: 409, message: 'x', code: 'LAST_OWNER' }, { status: 409 }),
      ),
    );
    renderRoute(`/staff?id=${staffId('owner')}`, { roles: ['owner'] });
    const drawer = await screen.findByRole('dialog', { name: 'Rania Aziz' });
    await user.click(within(drawer).getByRole('button', { name: 'Disable' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Disable Rania Aziz?' });
    await user.click(within(confirm).getByRole('button', { name: 'Disable' }));
    expect(
      await screen.findByText('This would leave no active Owner. Make someone else an Owner first.', {
        selector: '[data-slot=alert-description]',
      }),
    ).toBeInTheDocument();
    expect(account('owner').disabled).toBe(false);
  });

  it('resets a password (shown once) and two-factor, and revokes sessions', async () => {
    const user = userEvent.setup();
    renderRoute(`/staff?id=${staffId('owner')}`, { roles: ['owner'] });
    const drawer = await screen.findByRole('dialog', { name: 'Rania Aziz' });
    await user.click(within(drawer).getByRole('button', { name: 'Reset password' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reset password' }));
    const reveal = await screen.findByRole('dialog', { name: 'Temporary password for Rania Aziz' });
    expect((within(reveal).getByLabelText('Temporary password') as HTMLInputElement).value).toBe(
      account('owner').password,
    );
    expect(account('owner').mustChangePassword).toBe(true);
    await user.click(within(reveal).getByRole('button', { name: 'I handed it over' }));

    await user.click(await within(drawer).findByRole('button', { name: 'Reset two-factor' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reset two-factor' }));
    await waitFor(() => expect(account('owner').mfaSecret).toBeNull());
    expect(db().audit.some((a) => a.action === 'staff.reset_mfa')).toBe(true);
    expect(JSON.stringify(db().audit)).not.toContain(account('owner').password);
  });
});
