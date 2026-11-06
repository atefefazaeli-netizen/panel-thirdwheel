// The CSRF token for this staff session. It comes from `POST staff/auth/login`,
// `POST staff/auth/login/mfa` and `GET staff/auth/session`, lives only in module memory (never in
// web storage, never in React state) and is sent as `X-CSRF-Token` on every POST, PUT, PATCH and
// DELETE. A reload loses it on purpose: the panel calls `GET staff/auth/session` to get it again.

let token: string | null = null;

export function setCsrfToken(value: string | null | undefined): void {
  token = value || null;
}

export function getCsrfToken(): string | null {
  return token;
}

export function clearCsrfToken(): void {
  token = null;
}
