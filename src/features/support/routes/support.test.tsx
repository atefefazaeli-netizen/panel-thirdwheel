import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { server } from '@/mocks/node';
import { p } from '@/mocks/utils';
import { renderRoute } from '@/test/utils';

describe('support inbox (mock API)', () => {
  it('lists open tickets, fetches the screenshot with auth and closes a ticket', async () => {
    const user = userEvent.setup();
    let auth: string | null = null;
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/screenshot')) auth = request.headers.get('authorization');
    });
    renderRoute('/support', { roles: ['admin'] });
    const table = await screen.findByRole('table', { name: 'Support tickets' });
    await waitFor(() =>
      expect(within(table).getAllByRole('row').length).toBe(
        1 + db().support.tickets.filter((t) => t.status === 'open').length,
      ),
    );

    await user.click(within(table).getByText('The Plans tab spins forever after I add a memory.'));
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByRole('img', { name: 'Screenshot sent with the ticket' })).toBeInTheDocument();
    expect(auth).toMatch(/^Bearer /);
    server.events.removeAllListeners();

    await user.click(within(drawer).getByRole('button', { name: 'Close ticket' }));
    const t = db().support.tickets.find((x) => x.text.startsWith('The Plans tab'))!;
    await waitFor(() => expect(t.status).toBe('closed'));
    expect(await within(drawer).findByRole('button', { name: 'Reopen ticket' })).toBeInTheDocument();
  });

  it('shows when the screenshot cannot be loaded', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(p('support/tickets/:id/screenshot'), () =>
        HttpResponse.json({ statusCode: 404, message: 'No screenshot' }, { status: 404 }),
      ),
    );
    renderRoute('/support', { roles: ['admin'] });
    await user.click(await screen.findByText('The Plans tab spins forever after I add a memory.'));
    expect(await screen.findByText(/Could not load the screenshot/)).toBeInTheDocument();
  });

  it('deep links from a webhook (/support/<id>) open the ticket', async () => {
    const t = db().support.tickets.find((x) => x.status === 'closed')!;
    renderRoute(`/support/${t.id}`, { roles: ['admin'] });
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText(t.text)).toBeInTheDocument();
  });
});
