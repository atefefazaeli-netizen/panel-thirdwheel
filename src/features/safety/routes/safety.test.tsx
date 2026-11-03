import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { uid } from '@/mocks/data/users';
import { db } from '@/mocks/db';
import { renderRoute } from '@/test/utils';

describe('safety (mock API)', () => {
  it('shows the summary and filters open high flags from the URL', async () => {
    renderRoute('/safety?status=open&level=high', { roles: ['clinician'] });
    const table = await screen.findByRole('table', { name: 'Safety flags' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
    expect(within(table).getByText('priya@example.com')).toBeInTheDocument();
    expect(await screen.findByText('Open high')).toBeInTheDocument();
  });

  it('opens a flag, says it is metadata only, adds a note and marks it reviewed', async () => {
    const user = userEvent.setup();
    renderRoute('/safety?status=open&level=high', { roles: ['clinician'] });
    await user.click(await screen.findByText('priya@example.com'));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText(/Thirdwheel never stores what was typed/)).toBeInTheDocument();

    await user.type(within(drawer).getByRole('textbox', { name: 'Add a note' }), 'Called back, they are safe.');
    await user.click(within(drawer).getByRole('button', { name: 'Add note' }));
    expect(await within(drawer).findByText('Called back, they are safe.')).toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', { name: 'Mark reviewed' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark reviewed' });
    await user.click(within(dialog).getByRole('button', { name: 'Mark reviewed' }));
    const flag = db().safety.flags.find((f) => f.userId === uid('priya'))!;
    await waitFor(() => expect(flag.status).toBe('reviewed'));
    expect(flag.notes.map((n) => n.text)).toContain('Called back, they are safe.');
  });

  it('escalates with a note (at most 500 characters)', async () => {
    const user = userEvent.setup();
    const flag = db().safety.flags.find((f) => f.userId === uid('dev'))!;
    renderRoute(`/safety/${flag.id}`, { roles: ['admin'] });
    await user.click(await screen.findByRole('button', { name: 'Escalate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Escalate this flag?' });
    await user.type(within(dialog).getByRole('textbox'), 'Third repeat today.');
    await user.click(within(dialog).getByRole('button', { name: 'Escalate' }));
    await waitFor(() => expect(flag.status).toBe('escalated'));
    expect(flag.escalations.at(-1)!.note).toBe('Third repeat today.');
  });
});
