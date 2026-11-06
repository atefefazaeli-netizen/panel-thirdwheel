// Runtime configuration read from Vite env variables (see .env.example).
//
// Production builds refuse to start without VITE_API_URL and refuse VITE_API_MOCKS entirely
// (scripts/prod-guard.mjs, checked in vite.config.ts), so the mock API only ever runs in the dev
// server and in tests.

const rawApiUrl = (import.meta.env.VITE_API_URL ?? '').trim();
const mocksFlag = (import.meta.env.VITE_API_MOCKS ?? '').trim();

/**
 * The in-browser mock API (MSW) runs only in development: when forced with VITE_API_MOCKS=1, or
 * when no API URL is configured. VITE_API_MOCKS=0 turns it off (use the dev proxy instead).
 */
function mocksEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  if (mocksFlag === '1') return true;
  if (mocksFlag === '0') return false;
  return rawApiUrl === '';
}

export const env = {
  /** Base URL for every API call, without a trailing slash. */
  apiUrl: (rawApiUrl || '/api/v1').replace(/\/+$/, ''),
  useMocks: mocksEnabled(),
  isDev: import.meta.env.DEV,
} as const;
