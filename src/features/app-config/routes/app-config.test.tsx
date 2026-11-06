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
    expect(issue({ minVersion: '1.2' })).toBe('Use the form x.y.z, for example 1.4.0.');
    expect(issue({ recommendedVersion: 'v1.2.0' })).toBe('Use the form x.y.z, for example 1.4.0.');
    expect(issue({ minVersion: '1.10.0', recommendedVersion: '1.9.9' })).toBe(
      'The recommended version cannot be below the minimum version.',
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

describe('Remote Config page (mock API)', () => {
  it('edits the draft, shows the diff, publishes with a note', async () => {
    const user = userEvent.setup();
    renderRoute('/app-config', { roles: ['owner'] });
    await screen.findByText('Feature switches', { selector: 'legend' });
    expect(screen.getByText('The saved draft is the same as the published config.')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /Live games/ }));
    await user.click(screen.getByRole('switch', { name: /Show the maintenance screen/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    // Maintenance on needs a message.
    expect(await screen.findByText('Write the message people see during maintenance.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Maintenance message'), 'Back in ten minutes.');
    await user.type(screen.getByLabelText('Minimum version'), '1.2');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Use the form x.y.z, for example 1.4.0.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Minimum version'), '.0');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(db().appConfig.draft.minVersion).toBe('1.2.0'));

    const changes = await screen.findByRole('list', { name: 'Changes to publish' });
    expect(within(changes).getByText('Live games')).toBeInTheDocument();
    expect(within(changes).getByText('Maintenance screen')).toBeInTheDocument();
    expect(within(changes).getByText('Minimum version')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Publish to the app' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish version 3?' });
    await user.type(within(dialog).getByLabelText('Note (optional)'), 'Maintenance for the migration.');
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(db().appConfig.versions).toHaveLength(3));
    expect(db().appConfig.versions[2]).toMatchObject({
      version: 3,
      note: 'Maintenance for the migration.',
      config: {
        maintenance: { enabled: true, message: 'Back in ten minutes.' },
        minVersion: '1.2.0',
        features: { liveGames: false },
      },
    });
    expect(await screen.findByText('The saved draft is the same as the published config.')).toBeInTheDocument();
  });

  it('rolls back to an earlier version as a new version', async () => {
    const user = userEvent.setup();
    renderRoute('/app-config', { roles: ['owner'] });
    const table = await screen.findByRole('table', { name: 'Published versions' });
    const v1 = (await within(table).findByText('v1')).closest('tr')!;
    await user.click(within(v1).getByRole('button', { name: 'Roll back' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Roll back to version 1?' });
    await user.click(within(confirm).getByRole('button', { name: 'Roll back' }));
    await waitFor(() => expect(db().appConfig.versions).toHaveLength(3));
    expect(db().appConfig.versions[2]).toMatchObject({
      version: 3,
      rolledBackFrom: 1,
      config: { recommendedVersion: null },
    });
    expect(await within(table).findByText('Rollback to v1.', { exact: false })).toBeInTheDocument();
  });

  it('CONFIG_CONFLICT: someone published meanwhile; nothing is overwritten and the page offers the latest', async () => {
    const user = userEvent.setup();
    renderRoute('/app-config', { roles: ['owner'] });
    await screen.findByText('Feature switches', { selector: 'legend' });
    // Another Owner publishes version 3.
    const s = db().appConfig;
    s.versions.push({ ...s.versions[1]!, version: 3, note: 'Elsewhere' });
    await user.click(screen.getByRole('switch', { name: /Third Ear/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Changed by someone else')).toBeInTheDocument();
    expect(s.draft.features.thirdEar).toBe(true);
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Load the latest' }));
    expect(await screen.findByText(/Based on published version 3/)).toBeInTheDocument();
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
