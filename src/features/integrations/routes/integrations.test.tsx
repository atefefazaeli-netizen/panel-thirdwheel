import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { renderRoute } from '@/test/utils';

describe('integrations (mock API)', () => {
  it('creates a webhook and shows its secret once', async () => {
    const user = userEvent.setup();
    renderRoute('/settings/integrations', { roles: ['owner'] });
    await user.click(await screen.findByRole('button', { name: 'New webhook' }));
    const dialog = await screen.findByRole('dialog', { name: 'New webhook' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Plan changes to CRM');
    await user.type(within(dialog).getByRole('textbox', { name: 'URL' }), 'ftp://crm.example.com/hook');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Subscription changed' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create webhook' }));
    expect(await within(dialog).findByText('Use an http or https URL.')).toBeInTheDocument();

    const url = within(dialog).getByRole('textbox', { name: 'URL' });
    await user.clear(url);
    await user.type(url, 'https://crm.example.com/hook');
    await user.click(within(dialog).getByRole('button', { name: 'Create webhook' }));

    const secretDialog = await screen.findByRole('dialog', { name: /Signing secret for Plan changes to CRM/ });
    const created = db().integrations.webhooks.find((w) => w.name === 'Plan changes to CRM')!;
    expect(created.events).toEqual(['crisis.alert', 'user.subscription.changed']);
    expect(within(secretDialog).getByDisplayValue(db().integrations.secrets.get(created.id)!)).toBeInTheDocument();
    await user.click(within(secretDialog).getByRole('button', { name: 'I saved it' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByDisplayValue(/^whsec_/)).toBeNull();
  });

  it('a content reviewer approval sends content.published to subscribed, enabled webhooks', async () => {
    const content = db().integrations.webhooks.find((w) => w.events.includes('content.published'))!;
    content.enabled = true;
    const before = db().integrations.deliveries.length;
    const user = userEvent.setup();
    renderRoute('/review?id=my-perfect-day', { roles: ['content_reviewer'] });
    await user.click(await screen.findByRole('button', { name: 'Approve and publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve and publish' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve and publish' }));
    await waitFor(() => expect(db().integrations.deliveries.length).toBe(before + 1));
    expect(db().integrations.deliveries[0]).toMatchObject({
      webhookId: content.id,
      event: 'content.published',
      payload: { type: 'content.published', data: { itemId: 'my-perfect-day', version: 3, action: 'published' } },
    });
  });

  it('filters failed deliveries, opens the payload and retries', async () => {
    const user = userEvent.setup();
    renderRoute('/settings/integrations?tab=deliveries&status=failed', { roles: ['owner'] });
    const table = await screen.findByRole('table', { name: 'Webhook deliveries' });
    await waitFor(() =>
      expect(within(table).getAllByRole('row').length).toBe(
        1 + db().integrations.deliveries.filter((d) => d.status === 'failed').length,
      ),
    );
    await user.click(within(table).getAllByRole('row')[1]!);
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByLabelText('Payload JSON')).toHaveTextContent('"type"');
    await user.click(within(drawer).getByRole('button', { name: 'Retry delivery' }));
    await waitFor(() =>
      expect(db().integrations.deliveries.filter((d) => d.status === 'pending').length).toBeGreaterThan(1),
    );
  });

  it('creates an API key with scopes, shows it once and revokes one', async () => {
    const user = userEvent.setup();
    renderRoute('/settings/integrations?tab=api-keys', { roles: ['owner'] });
    await user.click(await screen.findByRole('button', { name: 'New API key' }));
    const dialog = await screen.findByRole('dialog', { name: 'New API key' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'n8n moderation v2');
    await user.click(within(dialog).getByRole('checkbox', { name: 'content.import' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create key' }));
    expect(await within(dialog).findByText('Pick at least one scope.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: 'users.flag' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create key' }));
    expect(await screen.findByDisplayValue(/^twk_[a-z0-9x]{8}_/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'I saved it' }));

    const row = (await screen.findByText('n8n clinician sheets')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Revoke' }));
    await user.click(await screen.findByRole('button', { name: 'Revoke key' }));
    await waitFor(() =>
      expect(db().integrations.apiKeys.find((k) => k.name === 'n8n clinician sheets')!.revokedAt).not.toBeNull(),
    );
  });

  it('shows the signature check with the headers', async () => {
    renderRoute('/settings/integrations?tab=verify', { roles: ['owner'] });
    expect(await screen.findByText('How to verify signatures')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Webhook headers' })).toHaveTextContent('X-Thirdwheel-Signature');
    expect(screen.getByLabelText('n8n snippet')).toHaveTextContent("createHmac('sha256', SECRET)");
  });

  it('needs integrations.read', async () => {
    renderRoute('/settings/integrations', { roles: ['content_reviewer'] });
    expect(await screen.findByText('Not available for your role')).toBeInTheDocument();
  });
});
