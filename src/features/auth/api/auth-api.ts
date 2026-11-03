// Panel sign-in uses the app's auth routes (backend auth.controller.ts): an email code with
// `login/start` → `verify` (mode login), `refresh` and `logout`; then `GET admin/me`.
import { api, getRefreshToken, type TokenPair } from '@/lib/api';
import type { StaffUser } from '@/stores/session';

export type StartResult =
  { ok: true; session: string; resendAt: number } | { ok: false; reason: 'exists' | 'not_found' | 'unchanged' };

export type CodeFailure = 'CODE_INCORRECT' | 'CODE_LOCKED' | 'CODE_EXPIRED' | 'SESSION_NOT_FOUND';

export type VerifyResult =
  | ({ ok: true; mode: 'signup' | 'login'; userId: string } & TokenPair)
  | { ok: false; attempts: number; locked: boolean; code: CodeFailure };

export const authApi = {
  startLogin: (email: string) => api.post<StartResult>('auth/login/start', { email }, { auth: false }),
  verify: (session: string, code: string) => api.post<VerifyResult>('auth/verify', { session, code }, { auth: false }),
  resend: (session: string) => api.post<{ resendAt: number }>('auth/resend', { session }, { auth: false }),
  me: () => api.get<StaffUser>('admin/me'),
  logout: async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) await api.post<void>('auth/logout', { refreshToken }, { auth: false });
  },
};
