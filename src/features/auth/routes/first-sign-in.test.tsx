// First sign-in since API v1.6.0 (adults-only sign-up): login/start answers not_found, the panel
// starts a sign-up, verify answers birthdayRequired with a ticket, and signup/complete creates the
// account only for an 18+ birthday. Runs on the mock API, which mirrors that contract.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '@/test/utils';
import { useSession } from '@/stores/session';

const NEW_STAFF = 'nobody@thirdwheel.app';

async function reachBirthdayStep() {
  const user = userEvent.setup();
  renderRoute('/login', { roles: null });
  await user.type(await screen.findByLabelText(/work email/i), NEW_STAFF);
  await user.click(screen.getByRole('button', { name: /send|code/i }));
  await user.type(await screen.findByLabelText(/code/i), '123456');
  await user.click(screen.getByRole('button', { name: /sign in|verify|continue/i }));
  expect(await screen.findByText(/one more step before your first sign-in/i)).toBeInTheDocument();
  return user;
}

describe('first sign-in (birthday step)', () => {
  it('asks the birthday after the code, then signs in for an adult', async () => {
    const user = await reachBirthdayStep();
    await user.type(screen.getByLabelText(/birthday/i), '1990-05-04');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(useSession.getState().status).toBe('signedIn'));
    expect(useSession.getState().user?.email).toBe(NEW_STAFF);
  });

  it('under 18: nothing is saved and the person starts again', async () => {
    const user = await reachBirthdayStep();
    const year = new Date().getFullYear() - 10;
    await user.type(screen.getByLabelText(/birthday/i), `${year}-01-01`);
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText(/adults 18 and over/i)).toBeInTheDocument();
    expect(useSession.getState().status).not.toBe('signedIn');
    await user.click(screen.getByRole('button', { name: /start again/i }));
    expect(await screen.findByLabelText(/work email/i)).toBeInTheDocument();
  });
});
