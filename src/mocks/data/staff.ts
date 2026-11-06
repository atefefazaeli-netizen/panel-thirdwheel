// Mock staff accounts, custom roles, sessions and MFA challenges (STAFF_API.md §2, §3), all in
// memory. Development and tests only: none of this is in a production build.
import { BUILTIN_ROLES, permissionsFor, type Permission } from '@/lib/permissions';
import { daysAgo, oid } from '../utils';

/** Every dev account signs in with this password (development mocks only). */
export const DEV_PASSWORD = 'panel-dev-password';
/** The dev Owner's TOTP secret (base32), so the dev sign-in hint can show a live code. */
export const DEV_OWNER_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

export interface StaffAccount {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  password: string;
  disabled: boolean;
  mfaSecret: string | null;
  /** Set by mfa/setup, active after mfa/enable. */
  pendingSecret: string | null;
  recoveryCodes: string[];
  /** Last TOTP step accepted (a step can't be used twice). */
  lastStep: number;
  mustChangePassword: boolean;
  failures: number;
  lockouts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CustomRole {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export interface StaffSession {
  id: string;
  staffId: string;
  csrfToken: string;
  restricted: 'mfa_enrollment' | 'password_change' | null;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
}

export interface MfaChallenge {
  staffId: string;
  expiresAt: number;
  wrong: number;
}

export interface StaffState {
  accounts: StaffAccount[];
  customRoles: CustomRole[];
  sessions: Map<string, StaffSession>;
  challenges: Map<string, MfaChallenge>;
  /**
   * The browser's cookie jar: the `tw_staff_sid` the mock API set last. The real cookie is HttpOnly
   * and sent by the browser; the mock keeps it here so the same flow works in the browser and in
   * Node tests.
   */
  jar: string | null;
}

export const staffId = (username: string) => oid(`staff:${username}`);

const account = (
  username: string,
  displayName: string,
  roles: string[],
  extra: Partial<StaffAccount> = {},
): StaffAccount => ({
  id: staffId(username),
  username,
  displayName,
  roles,
  password: DEV_PASSWORD,
  disabled: false,
  mfaSecret: null,
  pendingSecret: null,
  recoveryCodes: [],
  lastStep: -1,
  mustChangePassword: false,
  failures: 0,
  lockouts: 0,
  lockedUntil: null,
  lastLoginAt: daysAgo(1),
  createdAt: daysAgo(40),
  ...extra,
});

/** The dev usernames and what each one shows (also listed by the dev sign-in hint). */
export const DEV_ACCOUNTS: { username: string; what: string }[] = [
  { username: 'owner', what: 'Owner, two-factor on (the hint shows the code)' },
  { username: 'new.owner', what: 'Owner without two-factor yet: the enrollment step' },
  { username: 'editor', what: 'Content editor' },
  { username: 'reviewer', what: 'Content reviewer (clinical approval)' },
  { username: 'support', what: 'Support agent' },
  { username: 'safety', what: 'Safety reviewer' },
  { username: 'moderator', what: 'User moderator' },
  { username: 'analyst', what: 'Read-only analyst' },
  { username: 'temp.agent', what: 'Temporary password: the change-password step' },
];

export function seedStaff(): StaffState {
  return {
    accounts: [
      account('owner', 'Rania Aziz', ['owner'], {
        mfaSecret: DEV_OWNER_TOTP_SECRET,
        recoveryCodes: ['dev-recovery-0001', 'dev-recovery-0002'],
        createdAt: daysAgo(120),
      }),
      account('new.owner', 'Omar Saleh', ['owner'], { lastLoginAt: null, createdAt: daysAgo(2) }),
      account('editor', 'Huda Karim', ['content_editor']),
      account('reviewer', 'Dr. Noor Rahman', ['content_reviewer']),
      account('support', 'Yousef Ali', ['support_agent']),
      account('support.lead', 'Mira Nasser', ['support_lead']),
      account('safety', 'Dana Fares', ['safety_reviewer']),
      account('moderator', 'Sami Khoury', ['user_moderator']),
      account('analyst', 'Leila Mansour', ['analyst']),
      account('temp.agent', 'Karim Haddad', ['support_agent'], { mustChangePassword: true, lastLoginAt: null }),
      account('former', 'Former Editor', ['content_editor'], { disabled: true, lastLoginAt: daysAgo(60) }),
    ],
    customRoles: [
      {
        key: 'support_lead',
        name: 'Support lead',
        description: 'Support agent plus the audit log.',
        permissions: [
          'dashboard.read',
          'support.read',
          'support.assign',
          'support.prioritize',
          'support.note',
          'support.reply',
          'support.resolve',
          'audit.read',
        ],
      },
      {
        key: 'qa_reader',
        name: 'QA reader',
        description: 'Reads content and Remote Config for release checks.',
        permissions: ['dashboard.read', 'content.read', 'config.read'],
      },
    ],
    sessions: new Map(),
    challenges: new Map(),
    jar: null,
  };
}

export const isBuiltinRole = (key: string) => BUILTIN_ROLES.some((r) => r.key === key);

export function accountPermissions(a: StaffAccount, customRoles: CustomRole[]): Permission[] {
  return permissionsFor(a.roles, customRoles);
}

/** StaffMe (STAFF_API.md §2). */
export function staffMe(a: StaffAccount, customRoles: CustomRole[]) {
  return {
    id: a.id,
    username: a.username,
    displayName: a.displayName,
    roles: [...a.roles],
    permissions: accountPermissions(a, customRoles),
    mfaEnabled: !!a.mfaSecret,
    mustChangePassword: a.mustChangePassword,
    lastLoginAt: a.lastLoginAt,
  };
}

/** The admin list row (STAFF_API.md §3). */
export function staffRow(a: StaffAccount) {
  return {
    id: a.id,
    username: a.username,
    displayName: a.displayName,
    roles: [...a.roles],
    disabled: a.disabled,
    mfaEnabled: !!a.mfaSecret,
    mustChangePassword: a.mustChangePassword,
    lockedUntil: a.lockedUntil && Date.parse(a.lockedUntil) > Date.now() ? a.lockedUntil : null,
    lastLoginAt: a.lastLoginAt,
    createdAt: a.createdAt,
  };
}

/** A small common-password list, like the server's (STAFF_API.md §2). */
const COMMON = ['password1234', 'passwordpassword', '123456789012', 'qwertyuiopas', 'letmeinletmein', 'thirdwheel123'];

export function passwordProblems(pw: unknown, username: string): string[] {
  const problems: string[] = [];
  if (typeof pw !== 'string') return ['Send a password.'];
  if (pw.length < 12) problems.push('Use at least 12 characters.');
  if (pw.length > 128) problems.push('Use at most 128 characters.');
  if (username && pw.toLowerCase().includes(username.toLowerCase())) problems.push('Do not include your username.');
  if (COMMON.includes(pw.toLowerCase())) problems.push('This password is too common.');
  return problems;
}
