// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkProductionEnv, scanBundle } from '../../scripts/prod-guard.mjs';

describe('production build guard (checkProductionEnv)', () => {
  it('needs VITE_API_URL: https, or http only on localhost', () => {
    expect(checkProductionEnv({})).toEqual([expect.stringMatching(/^VITE_API_URL is required/)]);
    expect(checkProductionEnv({ VITE_API_URL: '  ' })).toHaveLength(1);
    expect(checkProductionEnv({ VITE_API_URL: '/api/v1' })).toEqual([expect.stringMatching(/absolute URL/)]);
    expect(checkProductionEnv({ VITE_API_URL: 'http://api.thirdwheel.app/api/v1' })).toEqual([
      expect.stringMatching(/must use https/),
    ]);
    expect(checkProductionEnv({ VITE_API_URL: 'https://user:pw@api.thirdwheel.app/api/v1' })).toHaveLength(1);
    expect(checkProductionEnv({ VITE_API_URL: 'https://api.thirdwheel.app/api/v1' })).toEqual([]);
    expect(checkProductionEnv({ VITE_API_URL: 'http://localhost:3000/api/v1' })).toEqual([]);
    expect(checkProductionEnv({ VITE_API_URL: 'http://127.0.0.1:3000/api/v1' })).toEqual([]);
  });

  it('refuses VITE_API_MOCKS whatever its value', () => {
    for (const v of ['1', '0', 'true']) {
      expect(checkProductionEnv({ VITE_API_URL: 'https://api.thirdwheel.app/api/v1', VITE_API_MOCKS: v })).toEqual([
        expect.stringMatching(/VITE_API_MOCKS is refused/),
      ]);
    }
  });
});

describe('vite.config.ts applies the guard to production builds only', () => {
  afterEach(() => vi.unstubAllEnvs());
  const load = async () => (await import('../../vite.config')).default as unknown as (e: object) => unknown;
  const run = async (command: 'build' | 'serve', mode: string) =>
    (await load())({ command, mode, isSsrBuild: false, isPreview: false });

  it('a production build without VITE_API_URL throws before building', async () => {
    vi.stubEnv('VITE_API_URL', '');
    vi.stubEnv('VITE_API_MOCKS', '');
    await expect(run('build', 'production')).rejects.toThrow(/Refusing to build the panel for production/);
  });

  it('a production build with VITE_API_MOCKS throws', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.thirdwheel.app/api/v1');
    vi.stubEnv('VITE_API_MOCKS', '1');
    await expect(run('build', 'production')).rejects.toThrow(/VITE_API_MOCKS is refused/);
  });

  it('a production build with an https API URL passes; the dev server never checks', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.thirdwheel.app/api/v1');
    vi.stubEnv('VITE_API_MOCKS', '');
    await expect(run('build', 'production')).resolves.toBeTruthy();
    vi.stubEnv('VITE_API_URL', '');
    vi.stubEnv('VITE_API_MOCKS', '1');
    await expect(run('serve', 'development')).resolves.toBeTruthy();
  });
});

describe('bundle scanner (scanBundle)', () => {
  const file = (path: string, content: string) => ({ path, content });

  it('finds the mock API, seed data, demo credentials and dev copy', () => {
    const findings = scanBundle([
      file('assets/a.js', 'import{setupWorker as x}from"msw/browser";'),
      file('assets/b.js', 'const s="Sara Haddad";'),
      file('assets/c.js', 'placeholder:"code 123456"'),
      file('assets/d.js', 'children:`Demo data: nothing here is real`'),
      file('assets/e.js', 'navigator.serviceWorker.register("/mockServiceWorker.js")'),
      file('mockServiceWorker.js', '/* worker */'),
      file('assets/f.js', 'const p="panel-dev-password"'),
    ]);
    const by = (f: string) => findings.filter((x) => x.file === f).map((x) => x.marker);
    expect(by('assets/a.js')).toEqual(expect.arrayContaining(['msw', 'setupWorker']));
    expect(by('assets/b.js')).toEqual(['Sara Haddad']);
    expect(by('assets/c.js')).toEqual(['123456']);
    expect(by('assets/d.js')).toEqual(['Demo data']);
    expect(by('assets/e.js')).toEqual(['mockServiceWorker']);
    expect(by('mockServiceWorker.js')).toEqual(['forbidden file']);
    expect(by('assets/f.js')).toEqual(['dev password']);
  });

  it('does not flag look-alikes: digit alphabets, words containing msw, binary assets', () => {
    expect(
      scanBundle([
        file('assets/qr.js', 'const ALNUM="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";'),
        file('assets/words.js', 'const msword="application/msword";const x="1234567";'),
        file('assets/font.woff2', 'msw 123456 Demo data'),
      ]),
    ).toEqual([]);
  });
});
