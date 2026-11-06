import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { uid } from '@/mocks/data/users';
import { db } from '@/mocks/db';
import { renderRoute } from '@/test/utils';

describe('users (mock API)', () => {
  it('filters by plan from the URL and lists Sara with her partner', async () => {
    renderRoute('/users?plan=plus&q=sara');
    const table = await screen.findByRole('table', { name: 'Users' });
    expect(await within(table).findByText('Sara')).toBeInTheDocument();
    expect(within(table).getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('1 result')).toBeInTheDocument();
  });

  it('needs users.read', async () => {
    renderRoute('/users', { roles: ['content_reviewer'] });
    expect(await screen.findByText('Not available for your role')).toBeInTheDocument();
  });

  it('suspends with a reason and shows the banner', async () => {
    const user = userEvent.setup();
    renderRoute(`/users/${uid('maya')}`);
    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Suspend' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await within(dialog).findByText('Give a reason.')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox'), 'Harassment reports');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText(/Harassment reports/)).toBeInTheDocument();
    expect(db().users.get(uid('maya'))!.account.suspended).toBe(true);
  });

  it('grants Plus to a linked account and carries it to the partner', async () => {
    const user = userEvent.setup();
    const target = [...db().users.values()].find(
      (u) => u.couple && u.subscription.state === 'free' && !u.account.roles.length,
    )!;
    renderRoute(`/users/${target.account.userId}`);
    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Grant Plus' }));
    const dialog = await screen.findByRole('dialog');
    const days = within(dialog).getByRole('spinbutton', { name: 'Days' });
    await user.clear(days);
    await user.type(days, '400');
    await user.click(within(dialog).getByRole('button', { name: 'Grant Plus' }));
    expect(await within(dialog).findByText('At most 365 days.')).toBeInTheDocument();
    await user.clear(days);
    await user.type(days, '14');
    await user.click(within(dialog).getByRole('button', { name: 'Grant Plus' }));
    await waitFor(() => expect(db().users.get(target.account.userId)!.subscription.plus).toBe(true));
    expect(db().users.get(target.couple!.partnerId)!.subscription.state).toBe('paid_by_partner');
  });

  it('deletes only after the email is typed', async () => {
    const user = userEvent.setup();
    renderRoute(`/users/${uid('omar')}`);
    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete account' }));
    const dialog = await screen.findByRole('alertdialog');
    const del = within(dialog).getByRole('button', { name: 'Delete account' });
    expect(del).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox'), db().users.get(uid('omar'))!.account.email!);
    await user.click(del);
    await waitFor(() => expect(db().users.has(uid('omar'))).toBe(false));
  });
});

describe('users when an owner module fails (null parts)', () => {
  it('shows Not available for a null plan and null safety and support summaries', async () => {
    const { http, HttpResponse } = await import('msw');
    const { server } = await import('@/mocks/node');
    const { p } = await import('@/mocks/utils');
    server.use(
      http.get(p('admin/users'), () =>
        HttpResponse.json({
          items: [
            {
              userId: uid('sara'),
              email: 'sara@example.com',
              name: null,
              createdAt: '2026-10-01T00:00:00Z',
              plan: null,
              plus: null,
              linked: null,
              partner: null,
              suspended: false,
              tags: [],
            },
          ],
          meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
        }),
      ),
      http.get(p('admin/users/:id'), () =>
        HttpResponse.json({
          account: db().users.get(uid('sara'))!.account,
          profile: null,
          couple: null,
          subscription: null,
          safety: null,
          support: null,
        }),
      ),
    );
    renderRoute('/users');
    const table = await screen.findByRole('table', { name: 'Users' });
    expect(await within(table).findAllByText('Not available')).toHaveLength(2);
    cleanup();
    renderRoute(`/users/${uid('sara')}`);
    expect(await screen.findByText('Not available: the safety service did not answer.')).toBeInTheDocument();
    expect(screen.getByText('Not available: the support service did not answer.')).toBeInTheDocument();
  });
});

describe('Plus source and receipt verification (ADMIN_API.md › AdminSubscriptionView)', () => {
  it('says a store purchase is unverified while the API mocks receipts, for the buyer and the partner', async () => {
    renderRoute(`/users/${uid('sara')}`);
    expect(
      await screen.findByText('Store purchase (receipt verification is mocked in this build)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Unverified')).toBeInTheDocument();
    cleanup();
    renderRoute(`/users/${uid('alex')}`);
    expect(
      await screen.findByText('Partner’s store purchase (receipt verification is mocked in this build)'),
    ).toBeInTheDocument();
  });

  it('an admin grant and no Plus carry no verification', async () => {
    const { plusSourceLabel } = await import('../lib/labels');
    expect(plusSourceLabel({ source: 'admin_grant', verification: null })).toBe('Admin grant');
    expect(plusSourceLabel({ source: 'none', verification: null })).toBe('None');
    expect(plusSourceLabel({ source: 'partner', verification: null })).toBe('Partner’s plan');
    expect(plusSourceLabel({ source: 'store', verification: 'store' })).toBe(
      'Store purchase (receipt verified by the store)',
    );
    expect(plusSourceLabel({})).toBe('Not reported by this API version');
  });
});

describe('unavailable parts are told apart from empty ones', () => {
  it('a failed profile or partners owner reads Not available, not No profile / Not linked', async () => {
    const { http, HttpResponse } = await import('msw');
    const { server } = await import('@/mocks/node');
    const { p } = await import('@/mocks/utils');
    server.use(
      http.get(p('admin/users/:id'), () =>
        HttpResponse.json({
          account: db().users.get(uid('sara'))!.account,
          profile: null,
          couple: null,
          subscription: null,
          safety: { open: 0, total: 0, lastAt: null },
          support: { total: 0, open: 0 },
          unavailable: ['profile', 'couple', 'subscription'],
        }),
      ),
    );
    renderRoute(`/users/${uid('sara')}`);
    expect(await screen.findByText('The profile service did not answer. Try again later.')).toBeInTheDocument();
    expect(screen.getByText('Not available: the partners service did not answer.')).toBeInTheDocument();
    expect(screen.queryByText('No profile yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Not linked with a partner.')).not.toBeInTheDocument();
  });
});
