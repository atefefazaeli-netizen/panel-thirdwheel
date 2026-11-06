/// <reference types="vitest/config" />
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { checkProductionEnv } from './scripts/prod-guard.mjs';

/**
 * Production builds never contain the mock API: MSW's service worker file (copied from public/ for
 * the dev server) is removed from dist/ after every build. `npm run check:prod-bundle` checks it.
 */
function dropMockWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'thirdwheel-drop-mock-worker',
    apply: 'build',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      fs.rmSync(path.join(outDir, 'mockServiceWorker.js'), { force: true });
    },
  };
}

// The dev server proxies /api to the Thirdwheel API so the panel and the API share an origin
// in development (no CORS setup needed). Production builds call VITE_API_URL directly.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:3000';

  // A production build must talk to a real API over https and can never run with mocks
  // (STAFF_API.md §9). Fail before building anything.
  if (command === 'build' && mode === 'production') {
    const problems = checkProductionEnv(env);
    if (problems.length) throw new Error(`Refusing to build the panel for production:\n  - ${problems.join('\n  - ')}`);
  }

  const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string };

  return {
    // Shown in the sidebar footer; one source of truth (package.json).
    define: { __PANEL_VERSION__: JSON.stringify(pkg.version) },
    plugins: [react(), tailwindcss(), dropMockWorker()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
    preview: { port: 4173 },
    build: {
      // Source maps are not shipped by default (they publish the whole source). VITE_SOURCEMAP=1
      // writes them without a sourceMappingURL, for upload to an error tracker.
      sourcemap: env.VITE_SOURCEMAP === '1' ? 'hidden' : false,
      chunkSizeWarningLimit: 900,
    },
    test: {
      environment: 'jsdom',
      // UI tests render Radix dialogs and tables in jsdom; on a loaded machine a few took over
      // Vitest's 5 s default. 15 s keeps CI stable without hiding real hangs.
      testTimeout: 15_000,
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.test.{ts,tsx}'],
      restoreMocks: true,
      env: { VITE_API_URL: '', VITE_API_MOCKS: '0' },
    },
  };
});
