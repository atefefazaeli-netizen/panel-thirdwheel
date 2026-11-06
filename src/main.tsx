import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/app';
import { env } from '@/config/env';
import '@/styles/globals.css';

async function enableDevMocks(): Promise<void> {
  // `import.meta.env.DEV` is a build-time constant: production builds drop this whole block, the
  // mock API, its seed data and the dev UI (checked by `npm run check:prod-bundle`).
  if (import.meta.env.DEV) {
    if (!env.useMocks) return;
    const [{ worker }, dev, { registerDevUi }] = await Promise.all([
      import('@/mocks/browser'),
      import('@/mocks/dev-ui'),
      import('@/config/dev-ui'),
    ]);
    await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
    registerDevUi({ Banner: dev.DevMockBanner, LoginHint: dev.DevLoginHint });
    document.title = `[MOCK API] ${document.title}`;
    console.warn('Thirdwheel panel: development mock API (MSW), not the real API.');
  }
}

void enableDevMocks().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
