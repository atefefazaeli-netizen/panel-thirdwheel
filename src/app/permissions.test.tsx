// Permission gating for every built-in role: the sidebar, routes ("Not available for your role")
// and the key action buttons. The UI decides only on the session's `permissions` (here computed by
// the mock server from the roles, exactly like the API).
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { uid } from '@/mocks/data/users';
import { db } from '@/mocks/db';
import { renderRoute } from '@/test/utils';

const NAV_BY_ROLE: Record<string, string[]> = {
  owner: [
    'Dashboard',
    'Content',
    'Review queue',
    'Import',
    'Users',
    'Safety',
    'Support inbox',
    'Remote Config',
    'AI engine',
    'Integrations',
    'Audit log',
    'Staff accounts',
    'Roles',
    'Date ideas',
    'Experiences',
  ],
  content_editor: ['Dashboard', 'Content', 'Review queue', 'Import', 'Date ideas', 'Experiences'],
  content_reviewer: ['Dashboard', 'Content', 'Review queue'],
  support_agent: ['Dashboard', 'Support inbox'],
  safety_reviewer: ['Dashboard', 'Safety'],
  user_moderator: ['Dashboard', 'Users'],
  analyst: ['Dashboard', 'Content', 'Review queue', 'Remote Config', 'AI engine'],
};

/** Paths each role may NOT open (a deep link shows the role state instead of the page). */
const FORBIDDEN_BY_ROLE: Record<string, string[]> = {
  owner: [],
  content_editor: [
    '/users',
    '/safety',
    '/support',
    '/app-config',
    '/ai-engine',
    '/audit',
    '/staff',
    '/staff/roles',
    '/settings/integrations',
  ],
  content_reviewer: ['/content/import', '/users', '/support', '/catalog', '/staff'],
  support_agent: ['/content', '/users', '/safety', '/app-config', '/staff', '/audit'],
  safety_reviewer: ['/content', '/users', '/support', '/ai-engine'],
  user_moderator: ['/content', '/safety', '/support', '/staff/roles'],
  analyst: ['/content/import', '/users', '/safety', '/support', '/audit', '/staff', '/catalog'],
};

async function navNames() {
  const nav = await screen.findByLabelText('Main navigation');
  await within(nav).findByText('Dashboard');
  return within(nav)
    .getAllByRole('link')
    .map((a) => a.textContent?.replace(/\d+$/, '').trim())
    .filter((t) => t && t !== 'ThirdwheelAdmin and content');
}

describe('sidebar per built-in role', () => {
  for (const [role, expected] of Object.entries(NAV_BY_ROLE)) {
    it(`${role}: ${expected.length} items`, async () => {
      renderRoute('/account', { roles: [role] });
      expect(await navNames()).toEqual(expected);
    });
  }
});

describe('route guard per built-in role', () => {
  for (const [role, paths] of Object.entries(FORBIDDEN_BY_ROLE)) {
    if (!paths.length) continue;
    it(`${role}: ${paths.join(', ')} show "Not available for your role"`, async () => {
      for (const path of paths) {
        const { unmount } = renderRoute(path, { roles: [role] });
        expect(await screen.findByText('Not available for your role'), path).toBeInTheDocument();
        unmount();
      }
    });
  }

  it('the Owner opens Staff, Roles and Remote Config', async () => {
    for (const [path, heading] of [
      ['/staff', 'Staff accounts'],
      ['/staff/roles', 'Roles'],
      ['/app-config', 'Remote Config'],
    ] as const) {
      const { unmount } = renderRoute(path, { roles: ['owner'] });
      expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeInTheDocument();
      unmount();
    }
  });

  it('without dashboard.read the home page opens the first page the role can see', async () => {
    db().staff.customRoles.push({
      key: 'flags_only',
      name: 'Flags only',
      description: '',
      permissions: ['safety.read'],
    });
    const { router } = renderRoute('/', { roles: ['flags_only'] });
    await waitFor(() => expect(router.state.location.pathname).toBe('/safety'));
  });
});

describe('key buttons follow the permissions', () => {
  it('review queue: Approve needs content.approve (disabled with a hint for an editor)', async () => {
    renderRoute('/review?id=my-perfect-day', { roles: ['content_editor'] });
    const approve = await screen.findByRole('button', { name: 'Approve and publish' });
    expect(approve).toBeDisabled();
    expect(approve.closest('[data-permission-gated]')).toHaveAttribute('aria-label', 'Not available for your role');
  });

  it('content list: New item and Import need content.edit', async () => {
    const { unmount } = renderRoute('/content', { roles: ['content_reviewer'] });
    await screen.findByRole('table', { name: /content/i });
    const main = document.getElementById('main')!;
    expect(within(main).queryByRole('link', { name: 'Import' })).toBeNull();
    expect(within(main).queryByRole('button', { name: 'New item' })).toBeNull();
    unmount();
    renderRoute('/content', { roles: ['content_editor'] });
    expect(await screen.findByRole('button', { name: 'New item' })).toBeInTheDocument();
  });

  it('content history: Roll back needs content.unpublish', async () => {
    const { unmount } = renderRoute('/content/blind-taste-test?tab=history', { roles: ['content_editor'] });
    await screen.findByRole('table', { name: 'Versions' });
    expect(screen.queryByRole('button', { name: 'Roll back' })).toBeNull();
    unmount();
    db().content.versions.push({ ...db().content.versions.find((v) => v.itemId === 'blind-taste-test')!, version: 0 });
    renderRoute('/content/blind-taste-test?tab=history', { roles: ['content_reviewer'] });
    await screen.findByRole('table', { name: 'Versions' });
    expect((await screen.findAllByRole('button', { name: 'Roll back' })).length).toBeGreaterThan(0);
  });

  it('users: a moderator signs out, suspends, tags and unlinks; no Plus and no delete', async () => {
    const user = userEvent.setup();
    renderRoute(`/users/${uid('sara')}`, { roles: ['user_moderator'] });
    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    const menu = await screen.findByRole('menu');
    const items = within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent?.trim());
    expect(items).toEqual(['Sign out everywhere', 'Suspend', 'Edit tags', 'Unlink partner']);
  });

  it('users: the detail hides the safety and support parts without safety.read and support.read', async () => {
    renderRoute(`/users/${uid('sara')}`, { roles: ['user_moderator'] });
    await screen.findByRole('button', { name: 'Actions' });
    expect(screen.queryByRole('link', { name: 'View flags' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open inbox' })).toBeNull();
  });

  it('users: the Owner gets every action', async () => {
    const user = userEvent.setup();
    renderRoute(`/users/${uid('sara')}`, { roles: ['owner'] });
    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    const items = within(await screen.findByRole('menu'))
      .getAllByRole('menuitem')
      .map((i) => i.textContent?.trim());
    expect(items).toEqual(expect.arrayContaining(['Grant Plus', 'Delete account', 'Suspend']));
  });

  it('safety: handling needs safety.handle (a read-only custom role sees no actions)', async () => {
    db().staff.customRoles.push({
      key: 'flag_reader',
      name: 'Flag reader',
      description: '',
      permissions: ['safety.read'],
    });
    const flag = db().safety.flags.find((f) => f.status === 'open')!;
    renderRoute(`/safety/${flag.id}`, { roles: ['flag_reader'] });
    expect(await screen.findByText('Metadata only', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Escalate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull();
  });

  it('safety: a safety reviewer can review and escalate', async () => {
    const flag = db().safety.flags.find((f) => f.status === 'open')!;
    renderRoute(`/safety/${flag.id}`, { roles: ['safety_reviewer'] });
    expect(await screen.findByRole('button', { name: 'Mark reviewed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escalate' })).toBeInTheDocument();
  });

  it('AI: ai.read reads only; ai.test alone gets only the console', async () => {
    const { unmount } = renderRoute('/ai-engine', { roles: ['analyst'] });
    expect(await screen.findByText('Read only')).toBeInTheDocument();
    expect(screen.queryByText('Test console')).toBeNull();
    expect(screen.queryByRole('button', { name: /Roll back/ })).toBeNull();
    unmount();
    db().staff.customRoles.push({ key: 'ai_tester', name: 'AI tester', description: '', permissions: ['ai.test'] });
    renderRoute('/ai-engine', { roles: ['ai_tester'] });
    expect(await screen.findByText('Test console')).toBeInTheDocument();
    expect(screen.queryByText('Read only')).toBeNull();
    expect(screen.queryByRole('radio', { name: /Anthropic/ })).toBeNull();
  });

  it('integrations: integrations.read sees no create, edit, revoke or retry', async () => {
    db().staff.customRoles.push({
      key: 'hook_reader',
      name: 'Hook reader',
      description: '',
      permissions: ['integrations.read'],
    });
    const { unmount } = renderRoute('/settings/integrations', { roles: ['hook_reader'] });
    expect(await screen.findByText(db().integrations.webhooks[0]!.name)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New webhook' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull();
    unmount();
    renderRoute('/settings/integrations?tab=api-keys', { roles: ['hook_reader'] });
    await screen.findByRole('table', { name: 'API keys' });
    expect(screen.queryByRole('button', { name: 'New API key' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });

  it('staff: the Owner (staff.manage) sees Add staff', async () => {
    renderRoute('/staff', { roles: ['owner'] });
    expect(await screen.findByRole('button', { name: 'Add staff' })).toBeInTheDocument();
  });
});
