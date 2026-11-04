import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/app';
import '@/styles/globals.css';

async function enableMocks(): Promise<void> {
  // Written out (not env.useMocks) so production builds without VITE_API_MOCKS=1 drop the mock
  // chunk entirely: the condition is a constant at build time.
  const forced = import.meta.env.VITE_API_MOCKS === '1';
  const off = import.meta.env.VITE_API_MOCKS === '0';
  if (!(forced || (!off && import.meta.env.DEV && !import.meta.env.VITE_API_URL))) return;
  const { worker } = await import('@/mocks/browser');
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
  // Loud on purpose: a demo build must never pass for the real panel (the banner says so too).
  document.title = `[DEMO DATA] ${document.title}`;
  console.warn('Thirdwheel panel: demo data from the in-browser mock API, not the real API.');
}

void enableMocks().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
