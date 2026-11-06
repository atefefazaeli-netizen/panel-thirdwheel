// Mirror of the backend's permission catalog and built-in roles
// (backend/libs/common/src/staff/permissions.ts, STAFF_API.md). The panel uses it for labels, the
// role editor and the dev mocks. Decisions in the UI are always made on the `permissions` the
// server returns in the session (`StaffMe.permissions`), never on role names.

export type PermissionGroup =
  'Dashboard' | 'Content' | 'Users' | 'Support' | 'Safety' | 'App config' | 'AI' | 'Integrations' | 'Staff' | 'Audit';

export interface PermissionInfo {
  group: PermissionGroup;
  label: string;
  /** Only the built-in Owner role holds it; custom roles can't include it. */
  ownerOnly?: true;
}

export const PERMISSION_CATALOG = {
  'dashboard.read': { group: 'Dashboard', label: 'See the dashboard (counts only for the areas you can open)' },

  'content.read': { group: 'Content', label: 'Read content, drafts, versions and the change log' },
  'content.edit': { group: 'Content', label: 'Create and edit drafts, discard drafts, import drafts' },
  'content.submit': { group: 'Content', label: 'Submit drafts for review' },
  'content.approve': { group: 'Content', label: 'Approve and publish, or request changes (clinical review)' },
  'content.unpublish': { group: 'Content', label: 'Unpublish, restore and roll back live content' },
  'catalog.manage': { group: 'Content', label: 'Edit the round 1 catalog, experiences and venue booking links' },

  'users.read': { group: 'Users', label: 'Search users and read account, profile, couple and plan details' },
  'users.signout': { group: 'Users', label: 'Sign a user out everywhere' },
  'users.suspend': { group: 'Users', label: 'Suspend and unsuspend users' },
  'users.tags': { group: 'Users', label: 'Manage user tags' },
  'users.unlink': { group: 'Users', label: 'Unlink a couple' },
  'users.delete': { group: 'Users', label: 'Delete a user account (erasure)' },
  'users.plus': { group: 'Users', label: 'Grant and end Plus manually' },

  'support.read': { group: 'Support', label: 'Read support tickets and their history' },
  'support.assign': { group: 'Support', label: 'Assign tickets' },
  'support.prioritize': { group: 'Support', label: 'Set ticket priority' },
  'support.note': { group: 'Support', label: 'Add internal notes (never sent to the user)' },
  'support.reply': { group: 'Support', label: 'Reply to the user' },
  'support.resolve': { group: 'Support', label: 'Change ticket status (in progress, waiting, resolved, closed)' },

  'safety.read': { group: 'Safety', label: 'Read safety flags (metadata only; every view is audited)' },
  'safety.handle': { group: 'Safety', label: 'Review, add notes and escalate safety flags' },

  'config.read': { group: 'App config', label: 'Read Remote Config, drafts and history' },
  'config.edit': { group: 'App config', label: 'Edit the Remote Config draft' },
  'config.publish': { group: 'App config', label: 'Publish Remote Config to the app' },
  'config.rollback': { group: 'App config', label: 'Roll Remote Config back to an earlier version' },

  'ai.read': { group: 'AI', label: 'Read AI engine settings and history' },
  'ai.edit': { group: 'AI', label: 'Change AI engine settings and roll back' },
  'ai.test': { group: 'AI', label: 'Use the staff AI test console (no user data)' },

  'integrations.read': { group: 'Integrations', label: 'Read webhooks, deliveries and API keys (never secrets)' },
  'integrations.manage': { group: 'Integrations', label: 'Create, change and delete webhooks and API keys' },

  'audit.read': { group: 'Audit', label: 'Read the audit log' },

  'staff.read': { group: 'Staff', label: 'List staff accounts and roles', ownerOnly: true },
  'staff.manage': { group: 'Staff', label: 'Create, change, disable and reset staff accounts', ownerOnly: true },
  'roles.manage': { group: 'Staff', label: 'Create and change custom roles', ownerOnly: true },
} as const satisfies Record<string, PermissionInfo>;

export type Permission = keyof typeof PERMISSION_CATALOG;
export const PERMISSIONS = Object.keys(PERMISSION_CATALOG) as Permission[];
export const OWNER_ONLY_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (p) => (PERMISSION_CATALOG[p] as PermissionInfo).ownerOnly,
);

export const isPermission = (s: unknown): s is Permission =>
  typeof s === 'string' && Object.prototype.hasOwnProperty.call(PERMISSION_CATALOG, s);

export const permissionInfo = (p: string): PermissionInfo | null =>
  isPermission(p) ? (PERMISSION_CATALOG[p] as PermissionInfo) : null;

/** Group order for the role editor (the catalog's order). */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  ...new Set(PERMISSIONS.map((p) => (PERMISSION_CATALOG[p] as PermissionInfo).group)),
];

export function permissionsByGroup(
  perms: readonly string[] = PERMISSIONS,
): { group: PermissionGroup; items: Permission[] }[] {
  const set = new Set(perms);
  return PERMISSION_GROUPS.map((group) => ({
    group,
    items: PERMISSIONS.filter((p) => set.has(p) && (PERMISSION_CATALOG[p] as PermissionInfo).group === group),
  })).filter((g) => g.items.length > 0);
}

export interface BuiltinRole {
  key: string;
  name: string;
  description: string;
  permissions: readonly Permission[];
}

/** The seven built-in roles (read-only in the panel). */
export const BUILTIN_ROLES = [
  {
    key: 'owner',
    name: 'Owner',
    description: 'Everything, including staff accounts and roles. Needs TOTP two-factor sign-in.',
    permissions: PERMISSIONS,
  },
  {
    key: 'content_editor',
    name: 'Content editor',
    description: 'Writes drafts and sends them for review. Cannot publish.',
    permissions: ['dashboard.read', 'content.read', 'content.edit', 'content.submit', 'catalog.manage'],
  },
  {
    key: 'content_reviewer',
    name: 'Content reviewer',
    description: 'Clinical review: approves and publishes, requests changes, unpublishes and rolls back.',
    permissions: ['dashboard.read', 'content.read', 'content.approve', 'content.unpublish'],
  },
  {
    key: 'support_agent',
    name: 'Support agent',
    description: 'Works the support inbox: assign, prioritise, internal notes, replies, status.',
    permissions: [
      'dashboard.read',
      'support.read',
      'support.assign',
      'support.prioritize',
      'support.note',
      'support.reply',
      'support.resolve',
    ],
  },
  {
    key: 'safety_reviewer',
    name: 'Safety reviewer',
    description: 'Reads and handles safety flags (metadata only).',
    permissions: ['dashboard.read', 'safety.read', 'safety.handle'],
  },
  {
    key: 'user_moderator',
    name: 'User moderator',
    description: 'Reads accounts; signs out, suspends, tags and unlinks. No deletion or Plus grants.',
    permissions: ['dashboard.read', 'users.read', 'users.signout', 'users.suspend', 'users.tags', 'users.unlink'],
  },
  {
    key: 'analyst',
    name: 'Read-only analyst',
    description: 'Reads the dashboard, content, Remote Config and AI settings. No private user data.',
    permissions: ['dashboard.read', 'content.read', 'config.read', 'ai.read'],
  },
] as const satisfies readonly BuiltinRole[];

export type BuiltinRoleKey = (typeof BUILTIN_ROLES)[number]['key'];

/** The union of the roles' permissions (unknown keys add nothing). Used by the mocks and tests. */
export function permissionsFor(
  roleKeys: readonly string[],
  customRoles: readonly { key: string; permissions: readonly string[] }[] = [],
): Permission[] {
  const out = new Set<Permission>();
  for (const k of roleKeys) {
    const role =
      (BUILTIN_ROLES as readonly BuiltinRole[]).find((r) => r.key === k) ?? customRoles.find((r) => r.key === k);
    for (const p of role?.permissions ?? []) if (isPermission(p)) out.add(p);
  }
  return PERMISSIONS.filter((p) => out.has(p));
}

/** A custom role's permissions must all be catalog permissions, none owner-only. Returns the problems. */
export function customRoleProblems(permissions: readonly unknown[]): string[] {
  const problems: string[] = [];
  if (!permissions.length) problems.push('Choose at least one permission.');
  for (const p of permissions) {
    if (!isPermission(p)) problems.push(`Unknown permission: ${String(p)}`);
    else if (OWNER_ONLY_PERMISSIONS.includes(p)) problems.push(`Only the Owner role can hold ${p}.`);
  }
  return problems;
}

/** Custom role key rule from STAFF_API.md §3. */
export const ROLE_KEY_RE = /^[a-z][a-z0-9_]{2,39}$/;
/** Staff username rule from STAFF_API.md §3. */
export const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;
