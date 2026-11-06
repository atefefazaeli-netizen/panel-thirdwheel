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
  minAppVersion: '',
  recommendedAppVersion: '',
};

describe('Remote Config validation', () => {
  it('maintenance message ≤ 280, no control characters, required when maintenance is on; versions are x.y.z; recommended ≥ minimum', () => {
    expect(configFormSchema.safeParse(valid).success).toBe(true);
    const issue = (v: object) => configFormSchema.safeParse({ ...valid, ...v }).error?.issues[0]?.message;
    expect(issue({ maintenanceMessage: 'x'.repeat(281) })).toBe('At most 280 characters.');
    expect(issue({ maintenanceMessage: 'Down\u0007' })).toBe('Remove the control characters.');
    expect(issue({ maintenanceEnabled: true })).toBe('Write the message people see during maintenance.');
    expect(issue({ minAppVersion: '1.2' })).toBe('Use the form x.y.z, for example 1.4.0 (no leading zeros).');
    expect(issue({ recommendedAppVersion: 'v1.2.0' })).toBe(
      'Use the form x.y.z, for example 1.4.0 (no leading zeros).',
    );
    expect(issue({ minAppVersion: '1.02.0' })).toBe('Use the form x.y.z, for example 1.4.0 (no leading zeros).');
    expect(issue({ minAppVersion: '1.100000.0' })).toBe('Use the form x.y.z, for example 1.4.0 (no leading zeros).');
    // The server's limit is five digits per part (libs/common isAppVersion).
    expect(configFormSchema.safeParse({ ...valid, minAppVersion: '1.10000.0' }).success).toBe(true);
    expect(issue({ minAppVersion: '1.10.0', recommendedAppVersion: '1.9.9' })).toBe(
      'The recommended version must be the same as or newer than the minimum version.',
    );
    expect(
      configFormSchema.safeParse({ ...valid, minAppVersion: '1.9.9', recommendedAppVersion: '1.10.0' }).success,
    ).toBe(true);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
  });

  it('the diff names every change in words', () => {
    const base = {
      features: { a: true, b: true },
      maintenance: { enabled: false, message: null },
      minAppVersion: null,
      recommendedAppVersion: '1.3.0',
    };
    const next = {
      features: { a: false, b: true },
      maintenance: { enabled: true, message: 'Back soon' },
      minAppVersion: '1.2.0',
      recommendedAppVersion: '1.3.0',
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

describe('Remote Config page (mock API, reconciled with v2.0.0)', () => {
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

  it('feature switches are exactly the server list (the 8 app keys), with its labels and descriptions', async () => {
    renderRoute('/app-config', { roles: ['owner'] });
    await screen.findByText('Feature switches', { selector: 'legend' });
    const fieldset = screen.getByText('Feature switches', { selector: 'legend' }).closest('fieldset')!;
    const names = within(fieldset)
      .getAllByRole('switch')
      .map((sw) => sw.closest('[data-slot=form-item]')!.querySelector('label')!.textContent);
    expect(names).toEqual([
      'Third Ear',
      'AI quiz and game design',
      'Voice input',
      'Plus purchases',
      'Book a place',
      'Our league',
      'Google Calendar',
      'Photo uploads',
    ]);
    expect(within(fieldset).getByText(/Mic transcription and voice recordings/)).toBeInTheDocument();
    expect(screen.queryByText('Spicy')).toBeNull();
  });

  it('saves the draft with the DRAFT version as baseVersion, shows the diff, publishes with a note', async () => {
    const user = userEvent.setup();
    const sent = await sentBodies('/admin/app-config/draft');
    const pub = await sentBodies('/admin/app-config/publish');
    renderRoute('/app-config', { roles: ['owner'] });
    await screen.findByText('Feature switches', { selector: 'legend' });
    expect(screen.getByText('The saved draft is the same as the published config.')).toBeInTheDocument();
    expect(screen.getByText(/Draft version 0/)).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /Voice input/ }));
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
    await waitFor(() => expect(db().appConfig.draft?.config.minAppVersion).toBe('1.2.0'));
    expect(db().appConfig.draft?.version).toBe(1);
    expect(sent.bodies[0]).toMatchObject({
      baseVersion: 0,
      config: { features: { voiceInput: false }, minAppVersion: '1.2.0', recommendedAppVersion: '1.3.0' },
    });

    const changes = await screen.findByRole('list', { name: 'Changes to publish' });
    expect(within(changes).getByText('Voice input')).toBeInTheDocument();
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
        minAppVersion: '1.2.0',
        features: { voiceInput: false, thirdEar: true, calendarSync: true },
      },
    });
    // The app gets it in its own shape.
    const { apiUrl } = await import('@/lib/api');
    const live = await (await fetch(apiUrl('app-config'))).json();
    expect(live).toMatchObject({
      version: 3,
      features: { voiceInput: false, league: true },
      maintenance: { enabled: true, message: 'Back in ten minutes.' },
      minAppVersion: '1.2.0',
      recommendedAppVersion: '1.3.0',
    });
    expect(db().audit[0]).toMatchObject({
      action: 'config.publish',
      meta: { version: 3, previousVersion: 2, featuresTurnedOff: ['voiceInput'], maintenance: true },
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
      config: { recommendedAppVersion: null },
    });
    expect(db().appConfig.draft).toMatchObject({ version: 1, config: { recommendedAppVersion: null } });
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
      config: { ...structuredClone(db().appConfig.versions[1]!.config), minAppVersion: '1.1.0' },
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
      config: { minAppVersion: '1.1.0', features: { thirdEar: true } },
    });
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Load the latest' }));
    expect(await screen.findByText(/Draft version 1/)).toBeInTheDocument();
    expect(screen.getByLabelText('Minimum version')).toHaveValue('1.1.0');
  });

  it('CONFIG_CONFLICT on publish (a rollback replaced the draft meanwhile) reloads the latest', async () => {
    const user = userEvent.setup();
    db().appConfig.draft = {
      config: { ...structuredClone(db().appConfig.versions[1]!.config), minAppVersion: '1.0.0' },
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
          {
            statusCode: 400,
            message: 'x',
            code: 'INVALID_CONFIG',
            details: ['features.liveGames is not a feature key (known: thirdEar, aiCreate)'],
          },
          { status: 400 },
        ),
      ),
    );
    renderRoute('/app-config', { roles: ['owner'] });
    await screen.findByText('Feature switches', { selector: 'legend' });
    await user.click(screen.getByRole('switch', { name: /Google Calendar/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('The server did not accept the draft')).toBeInTheDocument();
    expect(screen.getByText('features.liveGames is not a feature key (known: thirdEar, aiCreate)')).toBeInTheDocument();
  });

  it('before anything is published the app gets the default as version 0', async () => {
    db().appConfig.versions = [];
    renderRoute('/app-config', { roles: ['owner'] });
    expect(
      await screen.findByText(/nothing published yet: the app gets the default \(version 0\)/),
    ).toBeInTheDocument();
    const { apiUrl } = await import('@/lib/api');
    const pub = await (await fetch(apiUrl('app-config'))).json();
    expect(pub).toEqual({
      version: 0,
      updatedAt: '1970-01-01T00:00:00.000Z',
      features: {
        thirdEar: true,
        aiCreate: true,
        voiceInput: true,
        plusPurchases: true,
        venueBooking: true,
        league: true,
        calendarSync: true,
        photoUploads: true,
      },
      maintenance: { enabled: false, message: null },
      minAppVersion: null,
      recommendedAppVersion: null,
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

  it('the public GET app-config answers only the app’s fields, cached for 30 s, never a drafted maintenance message', async () => {
    db().appConfig.versions.push({
      ...structuredClone(db().appConfig.versions[1]!),
      version: 3,
      config: {
        ...structuredClone(db().appConfig.versions[1]!.config),
        maintenance: { enabled: false, message: 'Friday' },
      },
    });
    const { apiUrl } = await import('@/lib/api');
    const res = await fetch(apiUrl('app-config'));
    expect(res.headers.get('cache-control')).toBe('public, max-age=30');
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ['features', 'maintenance', 'minAppVersion', 'recommendedAppVersion', 'updatedAt', 'version'].sort(),
    );
    expect(body.maintenance).toEqual({ enabled: false, message: null });
  });

  it('a rollback to the defaults (version 0) publishes them as a new version', async () => {
    renderRoute('/app-config', { roles: ['owner'] });
    await screen.findByText('Feature switches', { selector: 'legend' });
    const { appConfigApi } = await import('../api/app-config-api');
    const view = await appConfigApi.get();
    expect(view.limits).toEqual({ maintenanceMessageMax: 280, noteMax: 300 });
    const after = await appConfigApi.rollback(0, view.draft.version, 'Back to the defaults');
    expect(after.published).toMatchObject({
      version: 3,
      kind: 'rollback',
      rolledBackFrom: 0,
      config: { recommendedAppVersion: null },
    });
    expect(db().appConfig.draft).toMatchObject({ version: 1, config: { recommendedAppVersion: null } });
  });

  it('versions saved before staff accounts (v2.0.0 admin route) show who saved them; a rollback to 0 says so', async () => {
    db().appConfig.versions.push({
      ...structuredClone(db().appConfig.versions[1]!),
      version: 3,
      publishedBy: 'user:64b000000000000000000001',
      publishedByName: null,
      note: 'Saved in v2.0.0',
    });
    db().appConfig.versions.push({
      ...structuredClone(db().appConfig.versions[0]!),
      version: 4,
      kind: 'rollback',
      rolledBackFrom: 0,
      publishedBy: 'user:64b000000000000000000001',
      publishedByName: 'admin@thirdwheel.app',
      note: null,
    });
    renderRoute('/app-config', { roles: ['owner'] });
    const table = await screen.findByRole('table', { name: 'Published versions' });
    const v3 = (await within(table).findByText('v3')).closest('tr')!;
    expect(within(v3).getByText('Admin (before staff accounts)')).toBeInTheDocument();
    const v4 = within(table).getByText('v4').closest('tr')!;
    expect(within(v4).getByText('admin@thirdwheel.app')).toBeInTheDocument();
    expect(within(v4).getByText(/Rollback to the defaults/)).toBeInTheDocument();
  });
});
