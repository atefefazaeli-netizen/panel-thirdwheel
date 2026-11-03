import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { env } from '@/config/env';
import { App } from '@/app/app';
import '@/styles/globals.css';

async function enableMocks(): Promise<void> {
  if (!env.useMocks) return;
  const { worker } = await import('@/mocks/browser');
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
}

void enableMocks().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
