import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { uid } from '@/mocks/data/users';
import { db } from '@/mocks/db';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { p } from '@/mocks/utils';
import { renderRoute } from '@/test/utils';

describe('safety (mock API)', () => {
  it('shows the summary and filters open high flags from the URL', async () => {
    renderRoute('/safety?status=open&level=high', { roles: ['safety_reviewer'] });
    const table = await screen.findByRole('table', { name: 'Safety flags' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
    expect(within(table).getByText('priya@example.com')).toBeInTheDocument();
    expect(await screen.findByText('Open high')).toBeInTheDocument();
  });

  it('opens a flag, says it is metadata only, adds a note and marks it reviewed', async () => {
    const user = userEvent.setup();
    renderRoute('/safety?status=open&level=high', { roles: ['safety_reviewer'] });
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
    renderRoute(`/safety/${flag.id}`, { roles: ['owner'] });
    await user.click(await screen.findByRole('button', { name: 'Escalate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Escalate this flag?' });
    await user.type(within(dialog).getByRole('textbox'), 'Third repeat today.');
    await user.click(within(dialog).getByRole('button', { name: 'Escalate' }));
    await waitFor(() => expect(flag.status).toBe('escalated'));
    expect(flag.escalations.at(-1)!.note).toBe('Third repeat today.');
  });

  it('the surface filter runs on the server: every page, with the server total', async () => {
    const base = db().safety.flags[0]!;
    for (let i = 0; i < 25; i++)
      db().safety.flags.push({
        ...base,
        id: `6${String(i).padStart(23, 'a')}`,
        surface: 'quiz',
        lastAt: new Date(Date.now() - i * 60_000).toISOString(),
      });
    const quizTotal = db().safety.flags.filter((f) => f.surface === 'quiz').length;
    const urls: string[] = [];
    server.events.on('request:start', ({ request }) => void urls.push(request.url));
    renderRoute('/safety?surface=quiz&limit=10', { roles: ['safety_reviewer'] });
    const table = await screen.findByRole('table', { name: 'Safety flags' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(11));
    server.events.removeAllListeners();
    expect(urls.some((u) => u.includes('/admin/safety/flags?') && u.includes('surface=quiz'))).toBe(true);
    expect(screen.getByText(`${quizTotal} results`)).toBeInTheDocument();
  });

  it('empty, error, permission-denied and partial states', async () => {
    const { cleanup } = await import('@testing-library/react');
    renderRoute('/safety?surface=other&kind=heat&status=escalated', { roles: ['safety_reviewer'] });
    expect(await screen.findByText('No flags match')).toBeInTheDocument();
    cleanup();

    server.use(
      http.get(p('admin/safety/flags'), () =>
        HttpResponse.json({ statusCode: 500, message: 'Internal server error', requestId: 'r-500' }, { status: 500 }),
      ),
    );
    renderRoute('/safety', { roles: ['safety_reviewer'] });
    expect(await screen.findByText('Could not load this', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    cleanup();

    server.use(
      http.get(p('admin/safety/flags'), () =>
        HttpResponse.json(
          { statusCode: 403, message: 'Insufficient permission', code: 'INSUFFICIENT_PERMISSION' },
          { status: 403 },
        ),
      ),
    );
    renderRoute('/safety', { roles: ['safety_reviewer'] });
    expect(await screen.findByText('Not available for your role')).toBeInTheDocument();
    cleanup();

    // The summary failing leaves the list working (partial).
    server.resetHandlers();
    server.use(
      http.get(p('admin/safety/summary'), () =>
        HttpResponse.json({ statusCode: 503, message: 'Unavailable' }, { status: 503 }),
      ),
    );
    renderRoute('/safety?status=open&level=high', { roles: ['safety_reviewer'] });
    const table = await screen.findByRole('table', { name: 'Safety flags' });
    expect(await within(table).findByText('priya@example.com')).toBeInTheDocument();
    expect(await screen.findByText('Could not load this', {}, { timeout: 8000 })).toBeInTheDocument();
  }, 20_000);
});
