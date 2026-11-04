import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { server } from '@/mocks/node';
import { oid, p } from '@/mocks/utils';
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

  it('a deep link to an old ticket fetches it by id (GET support/tickets/:id), never by scanning pages', async () => {
    // 600 newer tickets: the old panel scanned at most 5 pages of 100 and gave up.
    const old = db().support.tickets[0]!;
    old.createdAt = '2025-01-01T00:00:00.000Z';
    for (let i = 0; i < 600; i++) {
      const id = oid(`bulk-ticket:${i}`);
      db().support.tickets.push({
        ...old,
        id,
        ref: `TW-SUP-${id.slice(-6).toUpperCase()}`,
        text: `Bulk ${i}`,
        createdAt: new Date(Date.now() - i * 1000).toISOString(),
      });
    }
    const urls: string[] = [];
    server.events.on('request:start', ({ request }) => void urls.push(request.url));
    renderRoute(`/support/${old.id}`, { roles: ['admin'] });
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText(old.text)).toBeInTheDocument();
    server.events.removeAllListeners();
    expect(urls.some((u) => u.endsWith(`/support/tickets/${old.id}`))).toBe(true);
    expect(urls.some((u) => u.includes('limit=100'))).toBe(false);
  });

  it('an unknown ticket reads Ticket not found (404 TICKET_NOT_FOUND)', async () => {
    renderRoute(`/support/${oid('no-such-ticket')}`, { roles: ['admin'] });
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('Ticket not found')).toBeInTheDocument();
  });

  it('a clinician following a ticket link sees the role state, not an error', async () => {
    const t = db().support.tickets[0]!;
    renderRoute(`/support/${t.id}`, { roles: ['clinician'] });
    expect(await screen.findByText('Not available for your role')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('closing a ticket records an audit entry as the staff member (mock mirrors the API)', async () => {
    const user = userEvent.setup();
    const t = db().support.tickets.find((x) => x.status === 'open')!;
    renderRoute(`/support?ticket=${t.id}`, { roles: ['admin'] });
    const drawer = await screen.findByRole('dialog');
    await user.click(await within(drawer).findByRole('button', { name: 'Close ticket' }));
    await waitFor(() => expect(t.status).toBe('closed'));
    expect(db().audit.some((e) => e.action === 'support.ticket_status' && e.target === `support_ticket:${t.id}`)).toBe(
      true,
    );
  });
});
