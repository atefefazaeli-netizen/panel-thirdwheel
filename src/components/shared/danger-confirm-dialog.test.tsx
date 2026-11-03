import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { DangerConfirmDialog } from './danger-confirm-dialog';

function setup(onConfirm = vi.fn()) {
  const onOpenChange = vi.fn();
  renderWithProviders(
    <DangerConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete account"
      description="This erases the account."
      confirmText="sara@example.com"
      inputLabel="Type the email to confirm:"
      confirmLabel="Delete account"
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, onOpenChange, user: userEvent.setup() };
}

describe('DangerConfirmDialog', () => {
  it('keeps the action disabled until the text matches', async () => {
    const { user } = setup();
    const button = screen.getByRole('button', { name: 'Delete account' });
    expect(button).toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'sara@example.co');
    expect(button).toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'm');
    expect(button).toBeEnabled();
  });

  it('matches case-insensitively and passes the typed text', async () => {
    const { user, onConfirm, onOpenChange } = setup(vi.fn().mockResolvedValue(undefined));
    await user.type(screen.getByRole('textbox'), '  SARA@example.com ');
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('SARA@example.com'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('stays open when the action fails', async () => {
    const { user, onOpenChange } = setup(vi.fn().mockRejectedValue(new Error('CONFIRM_MISMATCH')));
    await user.type(screen.getByRole('textbox'), 'sara@example.com');
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete account' })).toBeEnabled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('cancel names what is kept and does not confirm', async () => {
    const { user, onConfirm, onOpenChange } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
