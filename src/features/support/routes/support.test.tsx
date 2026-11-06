import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { staffId } from '@/mocks/data/staff';
import { db } from '@/mocks/db';
import { server } from '@/mocks/node';
import { oid, p } from '@/mocks/utils';
import { renderRoute, signInAs } from '@/test/utils';

const ticketBy = (start: string) => db().support.tickets.find((t) => t.text.startsWith(start))!;
const history = () => screen.findByRole('list', { name: 'Ticket history' });

describe('support inbox (mock API)', () => {
  it('lists open tickets by default (status=open)', async () => {
    const seen: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/support/tickets?')) seen.push(request.url);
    });
    renderRoute('/support', { roles: ['support_agent'] });
    const table = await screen.findByRole('table', { name: 'Support tickets' });
    const open = db().support.tickets.filter((t) => t.status === 'open').length;
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBe(1 + open));
    server.events.removeAllListeners();
    expect(seen.at(-1)).toContain('status=open');
    expect(within(table).getAllByText('Unassigned').length).toBeGreaterThan(0);
  });

  it('filters by assignee (unassigned) and priority on the server', async () => {
    renderRoute('/support?status=all&assignee=unassigned&priority=low', { roles: ['support_agent'] });
    const table = await screen.findByRole('table', { name: 'Support tickets' });
    const expected = db().support.tickets.filter((t) => !t.assignee && t.priority === 'low');
    expect(expected.length).toBeGreaterThan(0);
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBe(1 + expected.length));
  });

  it('assignee=me is resolved from the session', async () => {
    const mine = db().support.tickets[2]!;
    mine.assignee = staffId('test.support_agent');
    renderRoute('/support?status=all&assignee=me', { roles: ['support_agent'] });
    const table = await screen.findByRole('table', { name: 'Support tickets' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
    expect(within(table).getByText(mine.text)).toBeInTheDocument();
  });

  it('filters by user id and text', async () => {
    const sara = db().support.tickets[0]!;
    renderRoute(`/support?status=all&userId=${sara.userId}&q=plans`, { roles: ['support_agent'] });
    const table = await screen.findByRole('table', { name: 'Support tickets' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
    expect(within(table).getByText(sara.text)).toBeInTheDocument();
  });

  it('shows the email provider dependency: replies stay pending until one is set up', async () => {
    renderRoute('/support', { roles: ['support_agent'] });
    expect(await screen.findByTestId('no-email-provider')).toHaveTextContent(
      'No email provider is configured: replies stay pending until one is set up',
    );
  });

  it('opens a ticket page from the list; deep links from a webhook (/support/<id>) work too', async () => {
    const user = userEvent.setup();
    renderRoute('/support', { roles: ['support_agent'] });
    await user.click(await screen.findByText('The Plans tab spins forever after I add a memory.'));
    expect(await screen.findByRole('heading', { name: ticketBy('The Plans tab').ref })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Screenshot sent with the ticket' })).toBeInTheDocument();

    const closed = db().support.tickets.find((x) => x.status === 'closed')!;
    renderRoute(`/support/${closed.id}`, { roles: ['support_agent'] });
    expect((await screen.findAllByText(closed.text)).length).toBeGreaterThan(0);
  });

  it('a deep link to an old ticket fetches it by id (GET support/tickets/:id), never by scanning pages', async () => {
    const old = db().support.tickets[0]!;
    old.createdAt = '2025-01-01T00:00:00.000Z';
    for (let i = 0; i < 300; i++) {
      const id = oid(`bulk-ticket:${i}`);
      db().support.tickets.push({
        ...old,
        id,
        ref: `TW-SUP-${id.slice(-6).toUpperCase()}`,
        text: `Bulk ${i}`,
        timeline: [],
      });
    }
    const urls: string[] = [];
    server.events.on('request:start', ({ request }) => void urls.push(request.url));
    renderRoute(`/support/${old.id}`, { roles: ['support_agent'] });
    expect(await screen.findByText(old.text)).toBeInTheDocument();
    server.events.removeAllListeners();
    expect(urls.some((u) => u.endsWith(`/support/tickets/${old.id}`))).toBe(true);
    expect(urls.some((u) => u.includes('limit=100'))).toBe(false);
  });

  it('an unknown ticket reads Ticket not found (404 TICKET_NOT_FOUND)', async () => {
    renderRoute(`/support/${oid('no-such-ticket')}`, { roles: ['support_agent'] });
    expect(await screen.findByText('Ticket not found')).toBeInTheDocument();
  });

  it('shows when the screenshot cannot be loaded', async () => {
    server.use(
      http.get(p('support/tickets/:id/screenshot'), () =>
        HttpResponse.json({ statusCode: 404, message: 'No screenshot' }, { status: 404 }),
      ),
    );
    renderRoute(`/support/${ticketBy('The Plans tab').id}`, { roles: ['support_agent'] });
    expect(await screen.findByText(/Could not load the screenshot/)).toBeInTheDocument();
  });

  it('a role without support.read following a ticket link sees the role state, not an error', async () => {
    renderRoute(`/support/${db().support.tickets[0]!.id}`, { roles: ['content_reviewer'] });
    expect(await screen.findByText('Not available for your role')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ticket workflow (mock API)', () => {
  it('changes status, priority and assignee with the version, and audits each without text', async () => {
    const user = userEvent.setup();
    const t = ticketBy('The Plans tab');
    const bodies: unknown[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT')
        void request
          .clone()
          .json()
          .then((b) => bodies.push(b));
    });
    renderRoute(`/support/${t.id}`, { roles: ['support_agent'] });
    await history();
    const v0 = t.version;
    await user.selectOptions(screen.getByLabelText('Status'), 'in_progress');
    await waitFor(() => expect(t.status).toBe('in_progress'));
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveValue('in_progress'));
    await user.selectOptions(screen.getByLabelText('Priority'), 'urgent');
    await waitFor(() => expect(t.priority).toBe('urgent'));
    await waitFor(() => expect(screen.getByLabelText('Assignee')).not.toBeDisabled());
    await user.selectOptions(screen.getByLabelText('Assignee'), 'Mira Nasser');
    await waitFor(() => expect(t.assignee).toBe(staffId('support.lead')));
    server.events.removeAllListeners();
    expect(bodies).toEqual([
      { status: 'in_progress', expectedVersion: v0 },
      { priority: 'urgent', expectedVersion: v0 + 1 },
      { staffId: staffId('support.lead'), expectedVersion: v0 + 2 },
    ]);
    expect(await within(await history()).findByText(/assigned it to Mira Nasser/)).toBeInTheDocument();
    const actions = db()
      .audit.filter((a) => a.target === `support_ticket:${t.id}`)
      .map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['support.status', 'support.priority', 'support.assign']));
    const status = db().audit.find((a) => a.action === 'support.status' && a.target === `support_ticket:${t.id}`)!;
    expect(status.meta).toEqual({ userId: t.userId, from: 'open', to: 'in_progress' });
    expect(JSON.stringify(db().audit)).not.toContain(t.text);
  });

  it('TICKET_CONFLICT: someone else changed the ticket; nothing is overwritten and the latest is loaded', async () => {
    const user = userEvent.setup();
    const t = ticketBy('The Plans tab');
    renderRoute(`/support/${t.id}`, { roles: ['support_agent'] });
    await history();
    // Someone else sets the priority meanwhile.
    t.priority = 'high';
    t.version += 1;
    await user.selectOptions(screen.getByLabelText('Status'), 'resolved');
    expect(await screen.findByText(/Someone else changed this ticket since you opened it/)).toBeInTheDocument();
    expect(t.status).toBe('open');
    await waitFor(() => expect(screen.getByLabelText('Priority')).toHaveValue('high'));
    expect(screen.getByLabelText('Status')).toHaveValue('open');
  });

  it('internal notes and replies are separate: the note is labelled "Internal, never sent"', async () => {
    const user = userEvent.setup();
    const t = ticketBy('The Plans tab');
    renderRoute(`/support/${t.id}`, { roles: ['support_agent'] });
    await history();
    await user.click(screen.getByRole('radio', { name: 'Internal note' }));
    expect(screen.getByText('Internal, never sent. Only staff with access to this ticket see it.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Note' }), 'Checked the logs, cache issue.');
    await user.click(screen.getByRole('button', { name: 'Add internal note' }));
    const note = await within(await history()).findByText('Checked the logs, cache issue.');
    const item = note.closest('li')!;
    expect(item).toHaveAttribute('data-kind', 'note');
    expect(within(item).getByText('Internal, never sent')).toBeInTheDocument();
    expect(t.timeline.at(-1)).toMatchObject({ type: 'note', text: 'Checked the logs, cache issue.' });
    expect(t.timeline.some((e) => e.type === 'reply')).toBe(false);
  });

  it('a reply without an email provider stays Pending (never Sent), with the reason and Retry', async () => {
    const user = userEvent.setup();
    const t = ticketBy('The Plans tab');
    renderRoute(`/support/${t.id}`, { roles: ['support_agent'] });
    await history();
    expect(screen.getByRole('radio', { name: 'Reply to the user' })).toHaveAttribute('data-state', 'on');
    await user.type(screen.getByRole('textbox', { name: 'Reply' }), 'Thanks, we are on it.');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    const text = await within(await history()).findByText('Thanks, we are on it.');
    const item = text.closest('li')!;
    expect(item).toHaveAttribute('data-kind', 'reply');
    expect(within(item).getByText('Pending')).toBeInTheDocument();
    expect(within(item).queryByText('Sent')).toBeNull();
    expect(within(item).getByText(/No email provider is configured/)).toBeInTheDocument();
    expect(within(item).queryByText('Internal, never sent')).toBeNull();

    // The provider comes online: Retry sends it, and only now it reads Sent.
    db().support.provider = 'mock-smtp';
    await user.click(within(item).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(within(item).getByText('Sent')).toBeInTheDocument());
    expect(within(item).queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('a failed delivery shows Failed with the provider error, and Retry runs it again', async () => {
    const user = userEvent.setup();
    db().support.provider = 'failing';
    const t = ticketBy('The Plans tab');
    renderRoute(`/support/${t.id}`, { roles: ['support_agent'] });
    await history();
    expect(screen.queryByTestId('no-email-provider')).toBeNull();
    await user.type(screen.getByRole('textbox', { name: 'Reply' }), 'Second try.');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    const item = (await within(await history()).findByText('Second try.')).closest('li')!;
    expect(within(item).getByText('Failed')).toBeInTheDocument();
    // A code from the API (SEND_FAILED), never the provider's own message.
    expect(within(item).getByText(/The email provider did not accept the reply/)).toBeInTheDocument();
    await user.click(within(item).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(within(item).getByText('Attempts: 2')).toBeInTheDocument());
  });

  it('read-only roles see the ticket but no controls or composer (support.read only)', async () => {
    db().staff.customRoles.push({
      key: 'support_reader',
      name: 'Support reader',
      description: '',
      permissions: ['support.read'],
    });
    const t = ticketBy('The Plans tab');
    renderRoute(`/support/${t.id}`, { roles: ['support_reader'] });
    await history();
    expect(screen.queryByLabelText('Status')).toBeNull();
    expect(screen.getByTestId('ticket-status-readonly')).toHaveTextContent('Open');
    expect(screen.queryByRole('button', { name: 'Send reply' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add internal note' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('notes and replies do not bump the version: a status change made on the old version still works', async () => {
    const user = userEvent.setup();
    const t = ticketBy('The Plans tab');
    renderRoute(`/support/${t.id}`, { roles: ['support_agent'] });
    await history();
    const v = t.version;
    // Someone else adds a note and a reply meanwhile (this page still holds version v).
    const { supportApi } = await import('../api/support-api');
    await supportApi.addNote(t.id, 'Looked at it.');
    await supportApi.reply(t.id, 'On it.');
    expect(t.version).toBe(v);
    await user.selectOptions(screen.getByLabelText('Status'), 'waiting_for_user');
    await waitFor(() => expect(t.status).toBe('waiting_for_user'));
    expect(t.version).toBe(v + 1);
  });

  it('setting the value a ticket already has changes nothing (no version bump, no entry)', async () => {
    const t = ticketBy('The Plans tab');
    signInAs(['support_agent']);
    const { supportApi } = await import('../api/support-api');
    const before = t.timeline.length;
    const view = await supportApi.setPriority(t.id, t.priority, t.version);
    expect(view.version).toBe(t.version);
    expect(t.timeline).toHaveLength(before);
    expect(view.timeline).toHaveLength(before);
  });

  it('views carry assignee, assigneeName, version and a timeline of actor / actorName entries', async () => {
    const t = db().support.tickets[1]!;
    signInAs(['support_agent']);
    const { supportApi } = await import('../api/support-api');
    const view = await supportApi.get(t.id);
    expect(view).toMatchObject({ assignee: staffId('support'), assigneeName: 'Yousef Ali', version: t.version });
    expect(view.timeline[0]).toMatchObject({ type: 'created', actor: 'user', actorName: null });
    expect(view.timeline.find((e) => e.type === 'reply')).toMatchObject({
      actor: `staff:${staffId('support')}`,
      actorName: 'Yousef Ali',
      delivery: { status: 'pending', provider: null, attempts: 0, lastError: 'NO_EMAIL_PROVIDER', sentAt: null },
    });
    expect(await supportApi.deliveryStatus()).toEqual({ provider: 'none', canSend: false });
  });

  it('q finds a ticket by its ref in any case, with or without the prefix', async () => {
    const t = db().support.tickets[4]!;
    signInAs(['support_agent']);
    const { supportApi } = await import('../api/support-api');
    for (const q of [t.ref, t.ref.toLowerCase(), t.ref.slice(-6).toLowerCase()]) {
      const page = await supportApi.list({ q });
      expect(page.items.map((x) => x.id)).toEqual([t.id]);
    }
  });

  it('refusals read clearly: ASSIGNEE_NOT_ELIGIBLE, REPLY_ALREADY_SENT, REPLY_NOT_FOUND, TICKET_TIMELINE_FULL', async () => {
    const t = ticketBy('The Plans tab');
    signInAs(['support_agent']);
    const { supportApi } = await import('../api/support-api');
    const { errorMessage } = await import('@/lib/api');
    const fail = (p: Promise<unknown>) => p.then(() => null).catch((e: unknown) => e as { code: string });

    const notEligible = await fail(supportApi.setAssignee(t.id, staffId('editor'), t.version));
    expect(notEligible?.code).toBe('ASSIGNEE_NOT_ELIGIBLE');
    expect(errorMessage(notEligible)).toMatch(/only active staff who can read support tickets/);

    db().support.provider = 'mock-smtp';
    const sent = await supportApi.reply(t.id, 'Hello.');
    const reply = sent.timeline.at(-1)!;
    expect(reply).toMatchObject({ type: 'reply', delivery: { status: 'sent', attempts: 1 } });
    const again = await fail(supportApi.retryReply(t.id, reply.id));
    expect(again?.code).toBe('REPLY_ALREADY_SENT');
    expect(errorMessage(again)).toBe('This reply was already sent.');
    expect((await fail(supportApi.retryReply(t.id, 'aaaaaaaaaaaaaaaaaaaaaaaa')))?.code).toBe('REPLY_NOT_FOUND');

    while (t.timeline.length < 500) t.timeline.push({ ...t.timeline[0]!, id: `x${t.timeline.length}` });
    const full = await fail(supportApi.addNote(t.id, 'One more.'));
    expect(full?.code).toBe('TICKET_TIMELINE_FULL');
    expect(errorMessage(full)).toMatch(/too much history/);
  });
});
