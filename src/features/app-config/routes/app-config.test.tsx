import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { db } from '@/mocks/db';
import { renderRoute } from '@/test/utils';
import { configDiff } from '../lib/diff';
import { compareVersions, configFormSchema } from '../schemas/config';

const valid = {
  features: { thirdEar: true },
  maintenanceEnabled: false,
  maintenanceMessage: '',
  minVersion: '',
  recommendedVersion: '',
};

describe('Remote Config validation', () => {
  it('maintenance message ≤ 280 and required when maintenance is on; versions are x.y.z; recommended ≥ minimum', () => {
    expect(configFormSchema.safeParse(valid).success).toBe(true);
    const issue = (v: object) => configFormSchema.safeParse({ ...valid, ...v }).error?.issues[0]?.message;
    expect(issue({ maintenanceMessage: 'x'.repeat(281) })).toBe('At most 280 characters.');
    expect(issue({ maintenanceEnabled: true })).toBe('Write the message people see during maintenance.');
    expect(issue({ minVersion: '1.2' })).toBe('Use the form x.y.z, for example 1.4.0 (no leading zeros).');
    expect(issue({ recommendedVersion: 'v1.2.0' })).toBe('Use the form x.y.z, for example 1.4.0 (no leading zeros).');
    expect(issue({ minVersion: '1.02.0' })).toBe('Use the form x.y.z, for example 1.4.0 (no leading zeros).');
    expect(issue({ minVersion: '1.10000.0' })).toBe('Use the form x.y.z, for example 1.4.0 (no leading zeros).');
    expect(issue({ minVersion: '1.10.0', recommendedVersion: '1.9.9' })).toBe(
      'The recommended version must be the same as or newer than the minimum version.',
    );
    expect(configFormSchema.safeParse({ ...valid, minVersion: '1.9.9', recommendedVersion: '1.10.0' }).success).toBe(
      true,
    );
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
  });

  it('the diff names every change in words', () => {
    const base = {
      features: { a: true, b: true },
      maintenance: { enabled: false, message: null },
      minVersion: null,
      recommendedVersion: '1.3.0',
    };
    const next = {
      features: { a: false, b: true },
      maintenance: { enabled: true, message: 'Back soon' },
      minVersion: '1.2.0',
      recommendedVersion: '1.3.0',
    };
    const d = configDiff(base, next, [{ key: 'a', label: 'Feature A', description: '' }]);
    expect(d.map((c) => `${c.label}: ${c.from} to ${c.to}`)).toEqual([
      'Feature A: On to Off',
      'Maintenance screen: Off to On',
      'Maintenance message: None to Back soon',
      'Minimum version: No limit to 1.2.0',
    ]);
  });
});

describe('Remote Config page (mock API, as built)', () => {
  const sentBodies = async (path: string) => {
    const { server } = await import('@/mocks/node');
    const bodies: Record<string, unknown>[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith(path) && request.method !== 'GET')
        void request
          .clone()
          .json()
          .then((b) => bodies.push(b));
    });
    return { bodies, stop: () => server.events.removeAllListeners() };
  };

  it('feature switches are exactly the server list, with its labels', async () => {
    renderRoute('/app-config', { roles: ['owner'] });
    await screen.findByText('Feature switches', { selector: 'legend' });
    const fieldset = screen.getByText('Feature switches', { selector: 'legend' }).closest('fieldset')!;
    const names = within(fieldset)
      .getAllByRole('switch')
      .map((sw) => sw.closest('[data-slot=form-item]')!.querySelector('label')!.textContent);
    expect(names).toEqual(['Third Ear', 'Spicy', 'Calendar']);
  });

  it('saves the draft with the DRAFT version as baseVersion, shows the diff, publishes with a note', async () => {
    const user = userEvent.setup();
    const sent = await sentBodies('/admin/app-config/draft');
    const pub = await sentBodies('/admin/app-config/publish');
    renderRoute('/app-config', { roles: ['owner'] });
    await screen.findByText('Feature switches', { selector: 'legend' });
    expect(screen.getByText('The saved draft is the same as the published config.')).toBeInTheDocument();
    expect(screen.getByText(/Draft version 0/)).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /Spicy/ }));
    await user.click(screen.getByRole('switch', { name: /Show the maintenance screen/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    // Maintenance on needs a message.
    expect(await screen.findByText('Write the message people see during maintenance.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Maintenance message'), 'Back in ten minutes.');
    await user.type(screen.getByLabelText('Minimum version'), '1.02');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText(/Use the form x\.y\.z/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Minimum version'));
    await user.type(screen.getByLabelText('Minimum version'), '1.2.0');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(db().appConfig.draft?.config.minVersion).toBe('1.2.0'));
    expect(db().appConfig.draft?.version).toBe(1);
    expect(sent.bodies[0]).toMatchObject({ baseVersion: 0, config: { features: { spicy: false } } });

    const changes = await screen.findByRole('list', { name: 'Changes to publish' });
    expect(within(changes).getByText('Spicy')).toBeInTheDocument();
    expect(within(changes).getByText('Maintenance screen')).toBeInTheDocument();
    expect(within(changes).getByText('Minimum version')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Publish to the app' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish version 3?' });
    await user.type(within(dialog).getByLabelText('Note (optional)'), 'Maintenance for the migration.');
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(db().appConfig.versions).toHaveLength(3));
    sent.stop();
    expect(pub.bodies[0]).toMatchObject({ baseVersion: 1, note: 'Maintenance for the migration.' });
    expect(db().appConfig.versions[2]).toMatchObject({
      version: 3,
      kind: 'publish',
      note: 'Maintenance for the migration.',
      config: {
        maintenance: { enabled: true, message: 'Back in ten minutes.' },
        minVersion: '1.2.0',
        features: { spicy: false, thirdEar: true, calendar: true },
      },
    });
    // Publishing bumps the draft version too.
    expect(db().appConfig.draft?.version).toBe(2);
    expect(await screen.findByText('The saved draft is the same as the published config.')).toBeInTheDocument();
    expect(screen.getByText(/Draft version 2/)).toBeInTheDocument();
  });

  it('rolls back to an earlier version as a new version, which also becomes the draft', async () => {
    const user = userEvent.setup();
    renderRoute('/app-config', { roles: ['owner'] });
    const table = await screen.findByRole('table', { name: 'Published versions' });
    const v1 = (await within(table).findByText('v1')).closest('tr')!;
    expect(within(v1).getByText(/Default config/)).toBeInTheDocument();
    await user.click(within(v1).getByRole('button', { name: 'Roll back' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Roll back to version 1?' });
    await user.click(within(confirm).getByRole('button', { name: 'Roll back' }));
    await waitFor(() => expect(db().appConfig.versions).toHaveLength(3));
    expect(db().appConfig.versions[2]).toMatchObject({
      version: 3,
      kind: 'rollback',
      rolledBackFrom: 1,
      config: { recommendedVersion: null },
    });
    expect(db().appConfig.draft).toMatchObject({ version: 1, config: { recommendedVersion: null } });
    expect(await within(table).findByText('Rollback to v1.', { exact: false })).toBeInTheDocument();
  });

  it('a rollback to a config equal to the live one is not offered (CONFIG_UNCHANGED)', async () => {
    const s = db().appConfig;
    s.versions.push({ ...structuredClone(s.versions[0]!), version: 3, kind: 'publish', note: 'Back to default' });
    renderRoute('/app-config', { roles: ['owner'] });
    const table = await screen.findByRole('table', { name: 'Published versions' });
    const v1 = (await within(table).findByText('v1')).closest('tr')!;
    expect(within(v1).getByRole('button', { name: 'Roll back' })).toBeDisabled();
    const v2 = within(table).getByText('v2').closest('tr')!;
    expect(within(v2).getByRole('button', { name: 'Roll back' })).toBeEnabled();
  });

  it('CONFIG_CONFLICT on a draft save: someone saved meanwhile; nothing is overwritten and the page offers the latest', async () => {
    const user = userEvent.setup();
    renderRoute('/app-config', { roles: ['owner'] });
    await screen.findByText('Feature switches', { selector: 'legend' });
    // Another Owner saves a draft (version 0 → 1) while this page is open.
    db().appConfig.draft = {
      config: { ...structuredClone(db().appConfig.versions[1]!.config), minVersion: '1.1.0' },
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: 'staff:other',
      updatedByName: 'Other Owner',
    };
    await user.click(screen.getByRole('switch', { name: /Third Ear/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Changed by someone else')).toBeInTheDocument();
    expect(db().appConfig.draft).toMatchObject({
      version: 1,
      config: { minVersion: '1.1.0', features: { thirdEar: true } },
    });
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Load the latest' }));
    expect(await screen.findByText(/Draft version 1/)).toBeInTheDocument();
    expect(screen.getByLabelText('Minimum version')).toHaveValue('1.1.0');
  });

  it('CONFIG_CONFLICT on publish (a rollback replaced the draft meanwhile) reloads the latest', async () => {
    const user = userEvent.setup();
    db().appConfig.draft = {
      config: { ...structuredClone(db().appConfig.versions[1]!.config), minVersion: '1.0.0' },
      version: 4,
      updatedAt: null,
      updatedBy: null,
      updatedByName: null,
    };
    renderRoute('/app-config', { roles: ['owner'] });
    await screen.findByText(/Draft version 4/);
    db().appConfig.draft!.version = 5;
    await user.click(screen.getByRole('button', { name: 'Publish to the app' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish version 3?' });
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText(/Draft version 5/)).toBeInTheDocument();
    expect(db().appConfig.versions).toHaveLength(2);
  });

  it('INVALID_CONFIG from the server lists each problem', async () => {
    const user = userEvent.setup();
    const { server } = await import('@/mocks/node');
    const { http, HttpResponse } = await import('msw');
    const { p } = await import('@/mocks/utils');
    server.use(
      http.put(p('admin/app-config/draft'), () =>
        HttpResponse.json(
          { statusCode: 400, message: 'x', code: 'INVALID_CONFIG', details: ['Unknown feature: liveGames'] },
          { status: 400 },
        ),
      ),
    );
    renderRoute('/app-config', { roles: ['owner'] });
    await screen.findByText('Feature switches', { selector: 'legend' });
    await user.click(screen.getByRole('switch', { name: /Calendar/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('The server did not accept the draft')).toBeInTheDocument();
    expect(screen.getByText('Unknown feature: liveGames')).toBeInTheDocument();
  });

  it('before anything is published the app gets the default as version 0', async () => {
    db().appConfig.versions = [];
    renderRoute('/app-config', { roles: ['owner'] });
    expect(
      await screen.findByText(/nothing published yet: the app gets the default \(version 0\)/),
    ).toBeInTheDocument();
    const { apiUrl } = await import('@/lib/api');
    const pub = await (await fetch(apiUrl('app-config'))).json();
    expect(pub).toMatchObject({
      version: 0,
      publishedAt: null,
      features: { thirdEar: true, spicy: true, calendar: true },
    });
  });

  it('config.read only (analyst): read-only switches, no save, publish or rollback', async () => {
    renderRoute('/app-config', { roles: ['analyst'] });
    await screen.findByText('Feature switches', { selector: 'legend' });
    expect(screen.getByRole('switch', { name: /Third Ear/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish to the app' })).toBeNull();
    await screen.findByRole('table', { name: 'Published versions' });
    expect(screen.queryByRole('button', { name: 'Roll back' })).toBeNull();
  });

  it('config.edit without publish (custom role): saves the draft but cannot publish', async () => {
    db().staff.customRoles.push({
      key: 'config_editor',
      name: 'Config editor',
      description: '',
      permissions: ['config.read', 'config.edit'],
    });
    renderRoute('/app-config', { roles: ['config_editor'] });
    await screen.findByText('Feature switches', { selector: 'legend' });
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish to the app' })).toBeNull();
  });

  it('the public GET app-config answers only public fields, cached for 60 s', async () => {
    const { apiUrl } = await import('@/lib/api');
    const res = await fetch(apiUrl('app-config'));
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(Object.keys(await res.json()).sort()).toEqual(
      ['features', 'maintenance', 'minVersion', 'publishedAt', 'recommendedVersion', 'version'].sort(),
    );
  });
});
