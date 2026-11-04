/// <reference types="vitest/config" />
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Production builds without VITE_API_MOCKS=1 never start MSW, so the service worker file copied
 * from public/ is dead weight that could be registered later: leave it out. A build with mocks on
 * keeps it, and says loudly that it is a demo build (the app shows a permanent banner too).
 */
function mocksOnlyWhenAsked(mocks: boolean): Plugin {
  let outDir = 'dist';
  return {
    name: 'thirdwheel-mocks-only-when-asked',
    apply: 'build',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
      if (mocks)
        c.logger.warn('\n  VITE_API_MOCKS=1: this is a DEMO build that answers from mock data, not the real API.\n');
    },
    closeBundle() {
      if (!mocks) fs.rmSync(path.join(outDir, 'mockServiceWorker.js'), { force: true });
    },
  };
}

// The dev server proxies /api to the Thirdwheel API so the panel and the API share an origin
// in development (no CORS setup needed). Production builds call VITE_API_URL directly.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:3000';
  const mocks = env.VITE_API_MOCKS === '1';

  return {
    plugins: [react(), tailwindcss(), mocksOnlyWhenAsked(mocks)],
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
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.test.{ts,tsx}'],
      restoreMocks: true,
      env: { VITE_API_URL: '', VITE_API_MOCKS: '0' },
    },
  };
});
