// Who is signed in. The staff member (`GET staff/auth/session`) is mirrored here because route
// guards, `Can` and the sidebar read it synchronously. No token or secret ever lives in this store:
// the session is an HttpOnly cookie the panel cannot read, and the CSRF token stays in the API
// client's module memory (src/lib/api/csrf.ts).
import { create } from 'zustand';
import { OWNER_ONLY_PERMISSIONS, type Permission } from '@/lib/permissions';

/** STAFF_API.md §2 `StaffMe`. */
export interface StaffMe {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  /** The union of the roles' permissions, computed by the server. The panel decides on these only. */
  permissions: string[];
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

/** A restricted session can only finish the named step (STAFF_API.md §2). */
export type Restriction = 'mfa_enrollment' | 'password_change';

export type SessionStatus = 'unknown' | 'signedOut' | 'signedIn' | 'restricted';
export type EndedReason = 'expired' | 'signed_out';

interface SessionState {
  status: SessionStatus;
  staff: StaffMe | null;
  restricted: Restriction | null;
  /** Why the last session ended, for the sign-in screen. */
  endedReason: EndedReason | null;
  setSession: (staff: StaffMe, restricted?: Restriction | null) => void;
  signOut: (reason?: EndedReason | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'unknown',
  staff: null,
  restricted: null,
  endedReason: null,
  setSession: (staff, restricted = null) =>
    set({ status: restricted ? 'restricted' : 'signedIn', staff, restricted, endedReason: null }),
  signOut: (reason = 'signed_out') => set({ status: 'signedOut', staff: null, restricted: null, endedReason: reason }),
}));

/** True when the signed-in staff member holds the permission (from the server's session). */
export function hasPermission(staff: StaffMe | null | undefined, perm: Permission): boolean {
  return !!staff && staff.permissions.includes(perm);
}

/** Any of the permissions (default), or all of them with `all: true`. An empty list allows. */
export function hasPermissions(
  staff: StaffMe | null | undefined,
  perms: Permission | readonly Permission[],
  all = false,
): boolean {
  const list = typeof perms === 'string' ? [perms] : perms;
  if (list.length === 0) return !!staff;
  return all ? list.every((p) => hasPermission(staff, p)) : list.some((p) => hasPermission(staff, p));
}

/** Reactive permission check for components. Only an unrestricted session holds permissions. */
export function useCan(perms: Permission | readonly Permission[], all = false): boolean {
  return useSession((s) => s.status === 'signedIn' && hasPermissions(s.staff, perms, all));
}

/** The session's permission list as a Set (stable per session object). */
export function usePermissions(): ReadonlySet<string> {
  const staff = useSession((s) => (s.status === 'signedIn' ? s.staff : null));
  return new Set(staff?.permissions ?? []);
}

/**
 * Two-factor sign-in is required for this account (the server answers 409 MFA_REQUIRED_FOR_ROLE to
 * a disable). Only the Owner role holds owner-only permissions, so holding one means MFA is
 * mandatory; the panel decides on the server's permissions, not on a role name.
 */
export function mfaRequired(staff: StaffMe | null | undefined): boolean {
  return !!staff && OWNER_ONLY_PERMISSIONS.some((p) => staff.permissions.includes(p));
}
