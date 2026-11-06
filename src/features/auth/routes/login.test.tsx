import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { getCsrfToken } from '@/lib/api/csrf';
import { DEV_OWNER_TOTP_SECRET, DEV_PASSWORD } from '@/mocks/data/staff';
import { db } from '@/mocks/db';
import { server } from '@/mocks/node';
import { totp } from '@/mocks/totp';
import { p } from '@/mocks/utils';
import { useSession } from '@/stores/session';
import { renderRoute } from '@/test/utils';

type User = ReturnType<typeof userEvent.setup>;

async function credentials(user: User, username: string, password = DEV_PASSWORD) {
  await user.type(await screen.findByLabelText('Username'), username);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

const dashboard = () => screen.findByRole('heading', { name: 'Dashboard' }, { timeout: 5000 });

/** Every Storage key, to prove no auth data is ever written to web storage. */
const storageDump = () => ({
  local: Object.fromEntries(Object.entries(localStorage)),
  session: Object.fromEntries(Object.entries(sessionStorage)),
});

describe('staff sign-in (mock API)', () => {
  it('ok: username and password open the panel; nothing about the session is in web storage', async () => {
    const user = userEvent.setup();
    renderRoute('/login', { roles: null });
    await credentials(user, 'editor');
    await dashboard();
    expect(useSession.getState()).toMatchObject({ status: 'signedIn', staff: { username: 'editor' } });
    // The CSRF token is in memory only; the session is the (simulated) HttpOnly cookie.
    expect(getCsrfToken()).toBe([...db().staff.sessions.values()].at(-1)!.csrfToken);
    // Web storage is empty: no token, no CSRF token, no staff data.
    expect(storageDump()).toEqual({ local: {}, session: {} });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('a wrong password and an unknown username read exactly the same (generic copy)', async () => {
    const user = userEvent.setup();
    renderRoute('/login', { roles: null });
    await credentials(user, 'editor', 'not-the-password');
    const first = (await screen.findByRole('alert')).textContent;
    expect(first).toBe('The username or password is not right.');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    await user.clear(screen.getByLabelText('Username'));
    await credentials(user, 'nobody.here', 'not-the-password');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(first));
    // A disabled account too.
    await user.clear(screen.getByLabelText('Username'));
    await credentials(user, 'former');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(first));
  });

  it('locks the account after 5 failures (423 ACCOUNT_LOCKED with retryAt), even for the right password', async () => {
    const user = userEvent.setup();
    renderRoute('/login', { roles: null });
    for (let i = 0; i < 5; i++) {
      await user.clear(screen.queryByLabelText('Username') ?? (await screen.findByLabelText('Username')));
      await credentials(user, 'analyst', `wrong-password-${i}`);
      await screen.findByRole('alert');
    }
    expect(screen.getByRole('alert')).toHaveTextContent(
      /^Too many failed attempts\. This account is locked until .+\.$/,
    );
    await user.clear(screen.getByLabelText('Username'));
    await credentials(user, 'analyst');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/locked until/));
    expect(useSession.getState().status).not.toBe('signedIn');
  });

  it('mfa_required: a TOTP code from the authenticator signs in; a wrong code is refused', async () => {
    const user = userEvent.setup();
    renderRoute('/login', { roles: null });
    await credentials(user, 'owner');
    const code = await screen.findByLabelText('Authenticator code');
    await user.type(code, '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText(/That code is not right/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Authenticator code'));
    await user.type(screen.getByLabelText('Authenticator code'), await totp(DEV_OWNER_TOTP_SECRET));
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await dashboard();
    expect(useSession.getState().staff?.username).toBe('owner');
  });

  it('mfa_required: a recovery code works once', async () => {
    const user = userEvent.setup();
    renderRoute('/login', { roles: null });
    await credentials(user, 'owner');
    await user.click(await screen.findByRole('button', { name: 'Use a recovery code instead' }));
    await user.type(screen.getByLabelText('Recovery code'), 'dev-recovery-0001');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await dashboard();
    expect(db().staff.accounts.find((a) => a.username === 'owner')!.recoveryCodes).not.toContain('dev-recovery-0001');
  });

  it('mfa_enrollment_required: shows the key and QR, confirms a code, then the recovery codes once with "I saved them"', async () => {
    const user = userEvent.setup();
    renderRoute('/login', { roles: null });
    await credentials(user, 'new.owner');
    expect(await screen.findByText('Set up two-factor sign-in')).toBeInTheDocument();
    expect(useSession.getState()).toMatchObject({ status: 'restricted', restricted: 'mfa_enrollment' });
    expect(await screen.findByRole('img', { name: 'QR code for your authenticator app' })).toBeInTheDocument();
    const secret = (await screen.findByTestId('totp-secret')).textContent!.replace(/\s+/g, '');
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    // A restricted session cannot use the panel yet.
    const stats = await fetch(p('admin/stats'), { credentials: 'include' });
    expect(stats.status).toBe(403);

    await user.type(screen.getByLabelText('Code from the app'), await totp(secret));
    await user.click(screen.getByRole('button', { name: 'Turn on two-factor sign-in' }));
    const list = await screen.findByRole('list', { name: 'Recovery codes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    const go = screen.getByRole('button', { name: 'Continue' });
    expect(go).toBeDisabled();
    await user.click(screen.getByLabelText('I saved them somewhere safe'));
    await user.click(go);
    await dashboard();
    expect(useSession.getState()).toMatchObject({ status: 'signedIn', staff: { mfaEnabled: true } });
  });

  it('password_change_required: a temporary password must be replaced; the policy is checked first', async () => {
    const user = userEvent.setup();
    renderRoute('/login', { roles: null });
    await credentials(user, 'temp.agent');
    expect(await screen.findByText('Choose a new password')).toBeInTheDocument();
    expect(useSession.getState()).toMatchObject({ status: 'restricted', restricted: 'password_change' });
    // No current-password field: the one typed a moment ago is used.
    expect(screen.queryByLabelText('Current password')).toBeNull();
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('New password again'), 'short');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(await screen.findByText('At least 12 characters.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('New password'));
    await user.clear(screen.getByLabelText('New password again'));
    // The server's common-password list (400 WEAK_PASSWORD with details).
    await user.type(screen.getByLabelText('New password'), 'passwordpassword');
    await user.type(screen.getByLabelText('New password again'), 'passwordpassword');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(await screen.findByText('This password is too common.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('New password'));
    await user.clear(screen.getByLabelText('New password again'));
    await user.type(screen.getByLabelText('New password'), 'a long and private passphrase');
    await user.type(screen.getByLabelText('New password again'), 'a long and private passphrase');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    await dashboard();
    const a = db().staff.accounts.find((x) => x.username === 'temp.agent')!;
    expect(a).toMatchObject({ mustChangePassword: false, password: 'a long and private passphrase' });
  });

  it('after sign-in, writes carry X-CSRF-Token and reads do not', async () => {
    const user = userEvent.setup();
    const seen: { method: string; csrf: string | null }[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/admin/') || request.url.includes('/support/'))
        seen.push({ method: request.method, csrf: request.headers.get('x-csrf-token') });
    });
    renderRoute('/login', { roles: null });
    await credentials(user, 'support');
    await dashboard();
    const t = db().support.tickets[0]!;
    await useSession.getState(); // signed in
    const { supportApi } = await import('@/features/support/api/support-api');
    await supportApi.addNote(t.id, 'Checked.');
    server.events.removeAllListeners();
    const gets = seen.filter((s) => s.method === 'GET');
    const writes = seen.filter((s) => s.method !== 'GET');
    expect(gets.length).toBeGreaterThan(0);
    expect(gets.every((g) => g.csrf === null)).toBe(true);
    expect(writes).toEqual([{ method: 'POST', csrf: getCsrfToken() }]);
  });

  it('a reload restores the session with GET staff/auth/session (no token anywhere in the browser)', async () => {
    const user = userEvent.setup();
    const { unmount } = renderRoute('/login', { roles: null });
    await credentials(user, 'reviewer');
    await dashboard();
    unmount();
    // A reload: the store and the in-memory CSRF token are gone; only the cookie remains.
    useSession.setState({ status: 'unknown', staff: null, restricted: null });
    renderRoute('/review', { roles: null });
    expect(await screen.findByRole('heading', { name: 'Review queue' })).toBeInTheDocument();
    expect(useSession.getState().staff?.username).toBe('reviewer');
    expect(getCsrfToken()).toBeTruthy();
  });

  it('a session that ends (revoked) sends the person to sign-in on the next call', async () => {
    const user = userEvent.setup();
    renderRoute('/login', { roles: null });
    await credentials(user, 'reviewer');
    await dashboard();
    db().staff.sessions.clear();
    server.use(http.get(p('admin/stats'), () => HttpResponse.json({ statusCode: 401, message: 'x' }, { status: 401 })));
    await user.click(screen.getByRole('link', { name: 'Content' }));
    expect(await screen.findByLabelText('Username', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText('Your session ended. Sign in again.')).toBeInTheDocument();
  });
});
