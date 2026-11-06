// Staff sign-in and account routes (STAFF_API.md §2). Username and password only; the session is
// an HttpOnly cookie set by the API, and the CSRF token in each answer is kept in memory by the
// API client. Sign-in routes pass `auth: false` (a 401 there is a wrong password, not an expired
// session).
import { acceptSession, api, endSession, SESSION_PATH, type SessionInfo } from '@/lib/api';
import type { StaffMe } from '@/stores/session';

export type LoginResult =
  | { status: 'ok'; staff: StaffMe; csrfToken: string }
  | { status: 'mfa_required'; challenge: string }
  | { status: 'mfa_enrollment_required'; staff: StaffMe; csrfToken: string }
  | { status: 'password_change_required'; staff: StaffMe; csrfToken: string };

export interface MfaSetup {
  /** Base32 TOTP secret, pending until `mfa/enable`. */
  secret: string;
  otpauthUrl: string;
}

export interface OwnSession {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  userAgent: string | null;
}

/** The restriction a login answer puts on the new session. */
export function restrictionOf(r: LoginResult): SessionInfo['restricted'] {
  if (r.status === 'mfa_enrollment_required') return 'mfa_enrollment';
  if (r.status === 'password_change_required') return 'password_change';
  return null;
}

/** Records a login answer that carries a session (every status but mfa_required). */
export function acceptLogin(r: LoginResult): void {
  if (r.status === 'mfa_required') return;
  acceptSession({ staff: r.staff, csrfToken: r.csrfToken, restricted: restrictionOf(r) });
}

export const authApi = {
  login: async (username: string, password: string) => {
    const r = await api.post<LoginResult>('staff/auth/login', { username, password }, { auth: false });
    acceptLogin(r);
    return r;
  },
  loginMfa: async (challenge: string, proof: { code: string } | { recoveryCode: string }) => {
    const r = await api.post<LoginResult>('staff/auth/login/mfa', { challenge, ...proof }, { auth: false });
    acceptLogin(r);
    return r;
  },
  /** The current session; 401 STAFF_SESSION_REQUIRED when there is none. */
  session: async () => acceptSession(await api.get<SessionInfo>(SESSION_PATH, { auth: false })),
  logout: async () => {
    try {
      await api.post<void>('staff/auth/logout', undefined, { auth: false });
    } finally {
      endSession('signed_out');
    }
  },
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<void>('staff/auth/password', { currentPassword, newPassword }),
  mfaSetup: (password: string) => api.post<MfaSetup>('staff/auth/mfa/setup', { password }),
  mfaEnable: (code: string) => api.post<{ recoveryCodes: string[] }>('staff/auth/mfa/enable', { code }),
  regenerateRecoveryCodes: (code: string) =>
    api.post<{ recoveryCodes: string[] }>('staff/auth/mfa/recovery-codes', { code }),
  mfaDisable: (password: string, code: string) => api.post<void>('staff/auth/mfa/disable', { password, code }),
  sessions: () => api.get<OwnSession[]>('staff/auth/sessions'),
  revokeSession: (id: string) => api.delete<void>(`staff/auth/sessions/${encodeURIComponent(id)}`),
};
