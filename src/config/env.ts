// Runtime configuration read from Vite env variables (see .env.example).

const rawApiUrl = (import.meta.env.VITE_API_URL ?? '').trim();
const mocksFlag = (import.meta.env.VITE_API_MOCKS ?? '').trim();

/**
 * Mocks run in the browser (MSW) when forced with VITE_API_MOCKS=1, or in development when no
 * API URL is configured. VITE_API_MOCKS=0 always turns them off (use the dev proxy instead).
 */
function mocksEnabled(): boolean {
  if (mocksFlag === '1') return true;
  if (mocksFlag === '0') return false;
  return import.meta.env.DEV && rawApiUrl === '';
}

export const env = {
  /** Base URL for every API call, without a trailing slash. */
  apiUrl: (rawApiUrl || '/api/v1').replace(/\/+$/, ''),
  useMocks: mocksEnabled(),
  isDev: import.meta.env.DEV,
} as const;
