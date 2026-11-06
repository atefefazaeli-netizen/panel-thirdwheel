// Staff accounts and roles (STAFF_API.md §3). Owner-only permissions: staff.read, staff.manage,
// roles.manage.

export interface StaffRow {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  disabled: boolean;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  /** Set while the account is locked after failed sign-ins. */
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RoleView {
  key: string;
  name: string;
  description: string;
  permissions: string[];
  builtin: boolean;
  /** How many staff accounts hold the role. */
  holders: number;
}

export interface CatalogPermission {
  key: string;
  group: string;
  label: string;
  ownerOnly: boolean;
}

export interface StaffSessionRow {
  id: string;
  createdAt: string;
  lastSeenAt: string | null;
  userAgent: string | null;
}

export interface CreateStaffInput {
  username: string;
  displayName: string;
  roles: string[];
}

export interface RoleInput {
  key: string;
  name: string;
  description?: string;
  permissions: string[];
}
