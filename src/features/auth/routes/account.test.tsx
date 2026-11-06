import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { staffId } from '@/mocks/data/staff';
import { db } from '@/mocks/db';
import { totp } from '@/mocks/totp';
import { useSession } from '@/stores/session';
import { renderRoute, signInAs } from '@/test/utils';

const account = (username: string) => db().staff.accounts.find((a) => a.username === username)!;

describe('My account (mock API)', () => {
  it('changes the password; other sessions end', async () => {
    const user = userEvent.setup();
    renderRoute('/account', { roles: ['analyst'], username: 'me.analyst' });
    db().staff.sessions.set('sid_other', {
      id: 'sid_other',
      staffId: staffId('me.analyst'),
      csrfToken: 'x',
      restricted: null,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      userAgent: 'Phone',
    });
    await user.type(await screen.findByLabelText('Current password'), 'test-password-long');
    await user.type(screen.getByLabelText('New password'), 'a different passphrase');
    await user.type(screen.getByLabelText('New password again'), 'a different passphrase');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(account('me.analyst').password).toBe('a different passphrase'));
    expect(db().staff.sessions.has('sid_other')).toBe(false);
  });

  it('turns two-factor on (key, code, recovery codes), makes new recovery codes, and turns it off again', async () => {
    const user = userEvent.setup();
    renderRoute('/account', { roles: ['analyst'], username: 'me.mfa' });
    await user.click(await screen.findByRole('button', { name: 'Turn on two-factor sign-in' }));
    await user.type(screen.getByLabelText('Confirm your password'), 'test-password-long');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    const secret = (await screen.findByTestId('totp-secret')).textContent!.replace(/\s+/g, '');
    await user.type(screen.getByLabelText('Code from the app'), await totp(secret));
    await user.click(screen.getByRole('button', { name: 'Turn on two-factor sign-in' }));
    expect(within(await screen.findByRole('list', { name: 'Recovery codes' })).getAllByRole('listitem')).toHaveLength(
      10,
    );
    await user.click(screen.getByLabelText('I saved them somewhere safe'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(useSession.getState().staff?.mfaEnabled).toBe(true));

    const old = [...account('me.mfa').recoveryCodes];
    await user.click(await screen.findByRole('button', { name: 'Make new recovery codes' }));
    // The step used for enabling can't be used again: wait for the next one.
    account('me.mfa').lastStep -= 1;
    await user.type(screen.getByLabelText('Authenticator code'), await totp(secret));
    await user.click(screen.getByRole('button', { name: 'Make new codes' }));
    await screen.findByRole('list', { name: 'Recovery codes' });
    expect(account('me.mfa').recoveryCodes).not.toEqual(old);
    await user.click(screen.getByLabelText('I saved them somewhere safe'));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await user.click(await screen.findByRole('button', { name: 'Turn off' }));
    const dialog = await screen.findByRole('dialog', { name: 'Turn off two-factor sign-in?' });
    account('me.mfa').lastStep -= 1;
    await user.type(within(dialog).getByLabelText('Password'), 'test-password-long');
    await user.type(within(dialog).getByLabelText('Authenticator code'), await totp(secret));
    await user.click(within(dialog).getByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(account('me.mfa').mfaSecret).toBeNull());
  });

  it('Owners cannot turn two-factor off (no button; the server answers MFA_REQUIRED_FOR_ROLE too)', async () => {
    renderRoute('/account', { roles: ['owner'], username: 'me.owner' });
    account('me.owner').mfaSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    useSession.setState((s) => ({ staff: s.staff && { ...s.staff, mfaEnabled: true } }));
    expect(await screen.findByText(/Required for your role/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make new recovery codes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull();
    const { api } = await import('@/lib/api');
    const err = await api
      .post('staff/auth/mfa/disable', { password: 'x', code: '000000' })
      .catch((e: { code: string }) => e);
    expect((err as { code: string }).code).toBe('MFA_REQUIRED_FOR_ROLE');
  });

  it('lists own sessions and revokes another one', async () => {
    const user = userEvent.setup();
    signInAs(['analyst'], 'me.sessions');
    db().staff.sessions.set('sid_phone_000000', {
      id: 'sid_phone_000000',
      staffId: staffId('me.sessions'),
      csrfToken: 'x',
      restricted: null,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      userAgent: 'Safari on iPhone',
    });
    renderRoute('/account', { roles: ['analyst'], username: 'me.sessions' });
    const list = await screen.findByRole('list', { name: 'Your sessions' });
    const phone = (await within(list).findByText('Safari on iPhone')).closest('li')!;
    expect(within(list).getByText('This browser')).toBeInTheDocument();
    await user.click(within(phone).getByRole('button', { name: 'Revoke' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sign it out' }));
    await waitFor(() => expect(db().staff.sessions.has('sid_phone_000000')).toBe(false));
    await waitFor(() => expect(within(list).queryByText('Safari on iPhone')).toBeNull());
  });
});
