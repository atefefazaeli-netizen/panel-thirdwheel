import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { __resetClientForTests } from '@/lib/api/client';
import { __resetSessionForTests } from '@/features/auth/api/session';
import { resetDb } from '@/mocks/db';
import { server } from '@/mocks/node';
import { useSession } from '@/stores/session';

// jsdom lacks a few browser APIs Radix and the layout use (node-environment tests skip this).
const hasDom = typeof window !== 'undefined';
if (hasDom && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
if (hasDom) {
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
}

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetDb();
  __resetClientForTests();
  __resetSessionForTests();
  useSession.setState({ status: 'unknown', staff: null, restricted: null, endedReason: null });
  if (hasDom) {
    sessionStorage.clear();
    localStorage.clear();
  }
});
afterAll(() => server.close());
