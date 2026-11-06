import { api } from '@/lib/api';
import { PERMISSION_CATALOG, PERMISSIONS, type PermissionInfo } from '@/lib/permissions';
import type { CatalogPermission, CreateStaffInput, RoleInput, RoleView, StaffRow, StaffSessionRow } from './types';

const s = (id: string) => `admin/staff/${encodeURIComponent(id)}`;
const r = (key: string) => `admin/roles/${encodeURIComponent(key)}`;

/**
 * `GET admin/permissions` returns "the catalog with groups, labels, ownerOnly". The exact shape is
 * not pinned in STAFF_API.md, so this accepts a list of `{ key, group, label, ownerOnly }`, a map
 * `{ [key]: { group, label, ownerOnly } }` or `{ permissions: [...] }`.
 */
export function normalizeCatalog(raw: unknown): CatalogPermission[] {
  const fromEntry = (key: string, v: Partial<PermissionInfo> & { ownerOnly?: boolean }): CatalogPermission => ({
    key,
    group: v.group ?? 'Other',
    label: v.label ?? key,
    ownerOnly: !!v.ownerOnly,
  });
  const body =
    raw && typeof raw === 'object' && 'permissions' in raw ? (raw as { permissions: unknown }).permissions : raw;
  if (Array.isArray(body))
    return body
      .filter(
        (x): x is { key: string } => !!x && typeof x === 'object' && typeof (x as { key?: unknown }).key === 'string',
      )
      .map((x) => fromEntry(x.key, x as Partial<PermissionInfo>));
  if (body && typeof body === 'object')
    return Object.entries(body as Record<string, Partial<PermissionInfo>>).map(([k, v]) => fromEntry(k, v ?? {}));
  return localCatalog();
}

/** The mirrored catalog (src/lib/permissions.ts), used until the server's answers. */
export const localCatalog = (): CatalogPermission[] => PERMISSIONS.map((key) => fromLocal(key));
const fromLocal = (key: keyof typeof PERMISSION_CATALOG): CatalogPermission => {
  const v = PERMISSION_CATALOG[key] as PermissionInfo;
  return { key, group: v.group, label: v.label, ownerOnly: !!v.ownerOnly };
};

export const staffApi = {
  list: () => api.get<StaffRow[]>('admin/staff'),
  create: (input: CreateStaffInput) => api.post<{ staff: StaffRow; temporaryPassword: string }>('admin/staff', input),
  update: (id: string, patch: { displayName?: string; roles?: string[] }) => api.patch<StaffRow>(s(id), patch),
  disable: (id: string) => api.post<StaffRow>(`${s(id)}/disable`),
  enable: (id: string) => api.post<StaffRow>(`${s(id)}/enable`),
  resetPassword: (id: string) => api.post<{ temporaryPassword: string }>(`${s(id)}/reset-password`),
  resetMfa: (id: string) => api.post<StaffRow>(`${s(id)}/reset-mfa`),
  sessions: (id: string) => api.get<StaffSessionRow[]>(`${s(id)}/sessions`),
  revokeSessions: (id: string) => api.delete<void>(`${s(id)}/sessions`),
  permissions: async () => normalizeCatalog(await api.get<unknown>('admin/permissions')),
  roles: () => api.get<RoleView[]>('admin/roles'),
  createRole: (input: RoleInput) => api.post<RoleView>('admin/roles', input),
  updateRole: (key: string, patch: Omit<RoleInput, 'key'>) => api.patch<RoleView>(r(key), patch),
  deleteRole: (key: string) => api.delete<void>(r(key)),
};
