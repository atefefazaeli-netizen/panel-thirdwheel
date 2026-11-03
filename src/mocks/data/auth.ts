// Mock sign-in state: OTP sessions, access tokens and refresh tokens, all in memory.
import type { StaffUser } from '@/stores/session';

export const MOCK_CODE = '123456';
/** Access token lifetime the mock hands out, seconds. */
export const ACCESS_TTL_S = 900;

export interface OtpSession {
  email: string;
  attempts: number;
  locked: boolean;
}

export interface AuthState {
  otps: Map<string, OtpSession>;
  access: Map<string, { user: StaffUser; exp: number }>;
  refresh: Map<string, StaffUser>;
  staff: Map<string, StaffUser>;
}

/**
 * Roles by email, so RoleGate can be tried: `admin-only@…` is admin, `clinician@…` is clinician,
 * `nostaff@…` has no staff role (403 on admin/me). Any other email gets admin + clinician.
 */
export function rolesFor(email: string): string[] {
  const local = email.toLowerCase().split('@')[0] ?? '';
  if (local === 'admin-only') return ['admin'];
  if (local === 'clinician') return ['clinician'];
  if (local === 'nostaff') return [];
  return ['admin', 'clinician'];
}

export function seedAuth(): AuthState {
  return { otps: new Map(), access: new Map(), refresh: new Map(), staff: new Map() };
}
