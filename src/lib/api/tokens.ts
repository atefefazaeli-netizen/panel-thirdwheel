// Token storage. The access token lives only in memory (lost on reload, never readable by other
// tabs or persisted to disk). The refresh token lives in sessionStorage so a reload keeps the
// session in this tab, while closing the tab signs out. See docs/ARCHITECTURE.md › Auth.

export interface TokenPair {
  token: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
}

const REFRESH_KEY = 'tw-panel-refresh';
/** Treat the access token as expired this long before it really does. */
const SKEW_MS = 30_000;

let access: { token: string; expiresAt: number } | null = null;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function setTokens(pair: TokenPair, now = Date.now()): void {
  access = { token: pair.token, expiresAt: now + pair.expiresIn * 1000 };
  try {
    storage()?.setItem(REFRESH_KEY, pair.refreshToken);
  } catch {
    // Storage full or blocked: the session still works until reload.
  }
}

export function clearTokens(): void {
  access = null;
  try {
    storage()?.removeItem(REFRESH_KEY);
  } catch {
    // ignore
  }
}

export function getAccessToken(now = Date.now()): string | null {
  if (!access) return null;
  return access.expiresAt - SKEW_MS > now ? access.token : null;
}

/** The raw access token even when close to expiry (to compare before and after a refresh). */
export function peekAccessToken(): string | null {
  return access?.token ?? null;
}

export function getRefreshToken(): string | null {
  try {
    return storage()?.getItem(REFRESH_KEY) ?? null;
  } catch {
    return null;
  }
}
