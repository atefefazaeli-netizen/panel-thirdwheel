// Audit (content and clinical approval) on the mock API: provenance, concurrency, self-approval,
// held content, server field errors, the review filter and the import check. The same rules were
// verified against the real API and MongoDB (backend E2E and the audit's live scripts).
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { createItem } from '@/mocks/content-domain';
import { db } from '@/mocks/db';
import { server } from '@/mocks/node';
import { p } from '@/mocks/utils';
import { staffId } from '@/mocks/data/staff';
import { renderRoute } from '@/test/utils';

const bar = () => screen.findByRole('region', { name: 'Workflow' });
/** Someone else writes the item behind this screen's back (rev moves on, like the server). */
const bumpRev = (id: string, patch: Record<string, unknown> = {}) => {
  const i = db().content.items.get(id)!;
  db().content.items.set(id, { ...i, ...patch, rev: i.rev + 1 });
};

describe('content audit (mock API)', () => {
  it('shows Needs clinical review with the reasons, and the seed is not a sign-off', async () => {
    renderRoute('/content/blind-taste-test', { roles: ['content_editor', 'content_reviewer'] });
    await bar();
    expect(screen.getAllByText('Needs clinical review').length).toBeGreaterThan(0);
    const parts = screen.getByRole('list', { name: 'Parts that need clinical review' });
    expect(within(parts).getByText(/written by an AI/)).toBeInTheDocument();
    expect(screen.getByText(/seeded from the release 1 bundle, not a sign-off in this system/i)).toBeInTheDocument();
  });

  it('history labels seeded versions as not a sign-off', async () => {
    renderRoute('/content/blind-taste-test?tab=history', { roles: ['content_editor', 'content_reviewer'] });
    const versions = await screen.findByRole('table', { name: 'Versions' });
    expect(
      within(versions).getByText('Seeded from the Release 1 bundle, not a sign-off in this system'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Workbook (clinician-cleared)')).not.toBeInTheDocument();
  });

  it('a save after someone else saved shows the conflict, keeps the edits and offers the JSON', async () => {
    const user = userEvent.setup();
    renderRoute('/content/blind-taste-test', { roles: ['content_editor', 'content_reviewer'] });
    const b = await bar();
    const title = screen.getByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'Mine');
    bumpRev('blind-taste-test');
    await user.click(within(b).getByRole('button', { name: 'Save draft' }));
    const banner = await screen.findByRole('alert', { name: 'Changed by someone else' });
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Mine');
    expect(db().content.items.get('blind-taste-test')!.draft).toBeNull();
    expect(within(banner).getByRole('button', { name: /Copy my edits/ })).toBeInTheDocument();
    expect(within(b).getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.click(within(banner).getByRole('button', { name: /Load the latest/ }));
    await waitFor(() =>
      expect(screen.queryByRole('alert', { name: 'Changed by someone else' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Blind taste test');
  });

  it('approve carries the revision the clinician saw: a draft changed meanwhile is not approved', async () => {
    const user = userEvent.setup();
    renderRoute('/content/my-perfect-day', { roles: ['content_reviewer'] });
    const b = await bar();
    bumpRev('my-perfect-day');
    await user.click(within(b).getByRole('button', { name: 'Approve and publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve and publish' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve and publish' }));
    expect(await screen.findByRole('alert', { name: 'Changed by someone else' })).toBeInTheDocument();
    expect(db().content.items.get('my-perfect-day')!.liveVersion).toBe(2);
  });

  it('warns before a clinician approves a draft they last edited, and the log records it', async () => {
    const user = userEvent.setup();
    const i = db().content.items.get('my-perfect-day')!;
    db().content.items.set(i.id, {
      ...i,
      draft: { ...i.draft!, by: `staff:${staffId('test.content_editor.content_reviewer')}` },
    });
    renderRoute('/content/my-perfect-day', { roles: ['content_editor', 'content_reviewer'] });
    const b = await bar();
    await user.click(within(b).getByRole('button', { name: 'Approve and publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve and publish' });
    expect(within(dialog).getByText('You last edited this draft')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Approve and publish' }));
    await waitFor(() => expect(db().content.items.get('my-perfect-day')!.liveVersion).toBe(3));
    expect(
      db()
        .content.changes.filter((c) => c.itemId === 'my-perfect-day')
        .at(-1),
    ).toMatchObject({ action: 'approved', meta: { selfApproved: true } });
  });

  it('held content: red banner, and approve needs the acknowledgement', async () => {
    const user = userEvent.setup();
    const t = createItem(
      {
        id: 'repair-walk',
        pillar: 'do',
        kind: 'do-home',
        snapshot: {
          catalog: { title: 'Repair walk, 20 minutes', where: ['outside'], category: 'outdoors', minutes: 20 },
          body: { steps: [{ title: 'Walk', body: 'Side by side.' }] },
        },
      },
      { id: 'apikey:n8n', email: null, permissions: [] },
      new Date().toISOString(),
      'n8n',
      'in_review',
    );
    db().content.items.set(t.item.id, t.item);
    renderRoute('/content/repair-walk', { roles: ['content_reviewer'] });
    const b = await bar();
    expect(screen.getAllByText('Matches content held back from Release 1').length).toBeGreaterThan(0);
    await user.click(within(b).getByRole('button', { name: 'Approve and publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve and publish' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve and publish' }));
    expect(
      await within(dialog).findByText('Confirm you checked the held content before approving.'),
    ).toBeInTheDocument();
    expect(db().content.items.get('repair-walk')!.liveVersion).toBe(0);
    await user.click(within(dialog).getByRole('checkbox', { name: /I checked this against the held list/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Approve and publish' }));
    await waitFor(() => expect(db().content.items.get('repair-walk')!.liveVersion).toBe(1));
    expect(
      db()
        .content.changes.filter((c) => c.itemId === 'repair-walk')
        .at(-1),
    ).toMatchObject({ meta: { acknowledgedHeld: true } });
  });

  it('maps the server field errors onto the fields', async () => {
    const user = userEvent.setup();
    server.use(
      http.put(p('admin/content/:id/draft'), () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message: 'This content is not valid.',
            code: 'INVALID_CONTENT',
            details: ['catalog.title: not allowed by the server'],
          },
          { status: 400 },
        ),
      ),
    );
    renderRoute('/content/blind-taste-test', { roles: ['content_editor', 'content_reviewer'] });
    const b = await bar();
    const title = screen.getByRole('textbox', { name: 'Title' });
    await user.type(title, '!');
    await user.click(within(b).getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('not allowed by the server (server)')).toBeInTheDocument();
    expect(screen.getByText('The server did not accept this draft')).toBeInTheDocument();
  });

  it('the list filters by clinical review and marks the rows', async () => {
    renderRoute('/content?needsReview=true&pillar=do&limit=50', { roles: ['content_editor', 'content_reviewer'] });
    expect(await screen.findByText('Blind taste test')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Content items' });
    const rows = within(table)
      .getAllByRole('row')
      .filter((r) => within(r).queryAllByRole('cell').length > 0);
    expect(rows.length).toBe(30);
    for (const r of rows) expect(within(r).getByText('Needs clinical review')).toBeInTheDocument();
  });

  it('import: duplicates in the file, a server check against existing ids, per-item results', async () => {
    const user = userEvent.setup();
    renderRoute('/content/import', { roles: ['content_editor', 'content_reviewer'] });
    const editor = await screen.findByRole('textbox', { name: 'Items' });
    const item = (id: string, title: string) => ({
      id,
      pillar: 'quiz',
      kind: 'quiz-turn',
      catalog: { title },
      body: { cards: [{ text: 'Q?' }] },
    });
    await user.click(editor);
    await user.paste(
      JSON.stringify([
        item('brand-new', 'Brand new'),
        item('brand-new', 'Twice'),
        {
          ...item('blind-taste-test', 'x'),
          pillar: 'do',
          kind: 'do-home',
          body: { steps: [{ title: 'a', body: 'b' }] },
        },
      ]),
    );
    const table = await screen.findByRole('table', { name: 'Import preview' });
    expect(within(table).getByText('Listed twice in this import')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check against the server' }));
    expect(await within(table).findByText('New item')).toBeInTheDocument();
    expect(within(table).getByText('Exists: becomes its draft in review')).toBeInTheDocument();
    expect(db().content.items.has('brand-new')).toBe(false);
    await user.click(screen.getByRole('button', { name: /as drafts in review/ }));
    const results = await screen.findByRole('list', { name: 'Import results' });
    expect(within(results).getByText('Created, in review')).toBeInTheDocument();
    expect(db().content.items.get('brand-new')!.draft!.state).toBe('in_review');
  });

  it('review queue: approve carries the revision on screen; a change meanwhile shows the conflict', async () => {
    const user = userEvent.setup();
    renderRoute('/review?id=my-perfect-day', { roles: ['content_reviewer'] });
    const approve = await screen.findByRole('button', { name: 'Approve and publish' });
    bumpRev('my-perfect-day');
    await user.click(approve);
    const dialog = await screen.findByRole('dialog', { name: 'Approve and publish' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve and publish' }));
    const banner = await screen.findByRole('alert', { name: 'Changed by someone else' });
    expect(db().content.items.get('my-perfect-day')!.liveVersion).toBe(2);
    expect(screen.getByRole('button', { name: 'Approve and publish' })).toBeDisabled();
    await user.click(within(banner).getByRole('button', { name: 'Load the latest' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve and publish' })).toBeEnabled());
  });
});
