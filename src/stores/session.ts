// Who is signed in. Server state about the staff member (`GET admin/me`) is mirrored here because
// routing guards and RoleGate read it synchronously. Tokens never live in this store.
import { create } from 'zustand';

export type StaffRole = 'admin' | 'clinician';

export interface StaffUser {
  userId: string;
  email: string;
  roles: string[];
}

export type SessionStatus = 'unknown' | 'signedOut' | 'signedIn' | 'noAccess';

interface SessionState {
  status: SessionStatus;
  user: StaffUser | null;
  /** Email of a signed-in account that is not staff (shown on the no-access screen). */
  deniedEmail: string | null;
  /** Why the last session ended, for the sign-in screen. */
  endedReason: 'refresh_failed' | 'suspended' | 'signed_out' | null;
  signIn: (user: StaffUser) => void;
  deny: (email: string | null) => void;
  signOut: (reason?: SessionState['endedReason']) => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'unknown',
  user: null,
  deniedEmail: null,
  endedReason: null,
  signIn: (user) => set({ status: 'signedIn', user, deniedEmail: null, endedReason: null }),
  deny: (email) => set({ status: 'noAccess', user: null, deniedEmail: email }),
  signOut: (reason = 'signed_out') => set({ status: 'signedOut', user: null, deniedEmail: null, endedReason: reason }),
}));

export const hasRole = (user: StaffUser | null | undefined, role: StaffRole): boolean => !!user?.roles.includes(role);

export function useRoles() {
  const user = useSession((s) => s.user);
  return { user, isAdmin: hasRole(user, 'admin'), isClinician: hasRole(user, 'clinician') };
}

/** True when the user holds at least one of the roles. */
export function canAccess(user: StaffUser | null | undefined, allow: StaffRole | StaffRole[]): boolean {
  const roles = Array.isArray(allow) ? allow : [allow];
  return roles.some((r) => hasRole(user, r));
}

export function useCan(allow: StaffRole | StaffRole[]): boolean {
  const user = useSession((s) => s.user);
  return canAccess(user, allow);
}
