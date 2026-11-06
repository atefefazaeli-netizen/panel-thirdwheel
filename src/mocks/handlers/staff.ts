// Staff accounts and roles (STAFF_API.md §3): Owner-only routes. Role changes revoke the account's
// sessions; the last active Owner can't be removed; custom roles only from the catalog, never with
// owner-only permissions; built-in roles are fixed; a role in use can't be deleted.
import { http, HttpResponse } from 'msw';
import {
  BUILTIN_ROLES,
  customRoleProblems,
  PERMISSION_CATALOG,
  PERMISSIONS,
  ROLE_KEY_RE,
  USERNAME_RE,
  type Permission,
  type PermissionInfo,
} from '@/lib/permissions';
import { isBuiltinRole, staffRow, type StaffAccount } from '../data/staff';
import { db, recordAudit } from '../db';
import { guard, type MockActor } from '../session';
import { apiError, badRequest, nowIso, oid, p, randomToken, readJson } from '../utils';
import { revokeSessionsOf } from './auth';

const findStaff = (id: unknown) => db().staff.accounts.find((a) => a.id === String(id));
const staffNotFound = () => apiError(404, 'No staff account with that id.', 'STAFF_NOT_FOUND');
const roleExists = (key: string) => isBuiltinRole(key) || db().staff.customRoles.some((r) => r.key === key);

const isActiveOwner = (a: StaffAccount) => !a.disabled && a.roles.includes('owner');
/** True when the change would leave no active Owner. */
function leavesNoOwner(target: StaffAccount, next: { roles?: string[]; disabled?: boolean }): boolean {
  const after = { ...target, ...next } as StaffAccount;
  return (
    isActiveOwner(target) &&
    !isActiveOwner(after) &&
    !db().staff.accounts.some((a) => a.id !== target.id && isActiveOwner(a))
  );
}
const lastOwner = () => apiError(409, 'This would leave no active Owner.', 'LAST_OWNER');

/** A server-generated temporary password (shown once). */
const temporaryPassword = () => `${randomToken(6)}-${randomToken(6)}-${randomToken(6)}`;

function rolesView() {
  const accounts = db().staff.accounts;
  const holders = (key: string) => accounts.filter((a) => a.roles.includes(key)).length;
  return [
    ...BUILTIN_ROLES.map((r) => ({ ...r, permissions: [...r.permissions], builtin: true, holders: holders(r.key) })),
    ...db().staff.customRoles.map((r) => ({ ...r, builtin: false, holders: holders(r.key) })),
  ];
}

function onStaff(request: Request, id: unknown, fn: (a: StaffAccount, me: MockActor) => Response | Promise<Response>) {
  return guard(request, 'staff.manage', (me) => {
    const a = findStaff(id);
    return a ? fn(a, me) : staffNotFound();
  });
}

export const staffHandlers = [
  http.get(p('admin/staff'), ({ request }) =>
    guard(request, 'staff.read', () => HttpResponse.json(db().staff.accounts.map(staffRow))),
  ),

  http.post(p('admin/staff'), ({ request }) =>
    guard(request, 'staff.manage', async (me) => {
      const { username, displayName, roles } = await readJson<{
        username?: string;
        displayName?: string;
        roles?: unknown;
      }>(request);
      const u = String(username ?? '')
        .trim()
        .toLowerCase();
      if (!USERNAME_RE.test(u)) return badRequest('username must be 3 to 40 of a-z, 0-9, ".", "_" and "-"');
      if (!displayName?.trim()) return badRequest('displayName is required');
      if (!Array.isArray(roles) || !roles.length || roles.some((r) => typeof r !== 'string' || !roleExists(r)))
        return badRequest('roles must name existing roles');
      if (db().staff.accounts.some((a) => a.username === u))
        return apiError(409, 'That username is taken.', 'USERNAME_TAKEN');
      const temp = temporaryPassword();
      const a: StaffAccount = {
        id: oid(`staff:${u}:${randomToken(4)}`),
        username: u,
        displayName: displayName.trim(),
        roles: roles as string[],
        password: temp,
        disabled: false,
        mfaSecret: null,
        pendingSecret: null,
        recoveryCodes: [],
        lastStep: -1,
        mustChangePassword: true,
        failures: 0,
        lockouts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdAt: nowIso(),
      };
      db().staff.accounts.push(a);
      recordAudit(me, 'staff.create', `staff:${a.id}`, { roles: a.roles });
      return HttpResponse.json({ staff: staffRow(a), temporaryPassword: temp }, { status: 201 });
    }),
  ),

  http.patch(p('admin/staff/:id'), ({ request, params }) =>
    onStaff(request, params.id, async (a, me) => {
      const { displayName, roles } = await readJson<{ displayName?: string; roles?: unknown }>(request);
      if (roles !== undefined) {
        if (a.id === me.staffId) return apiError(409, 'You cannot change your own roles.', 'SELF_ROLE_CHANGE');
        if (!Array.isArray(roles) || !roles.length || roles.some((r) => typeof r !== 'string' || !roleExists(r)))
          return badRequest('roles must name existing roles');
        if (leavesNoOwner(a, { roles: roles as string[] })) return lastOwner();
      }
      if (displayName !== undefined && !String(displayName).trim()) return badRequest('displayName cannot be empty');
      if (displayName !== undefined) a.displayName = String(displayName).trim();
      if (roles !== undefined && (roles as string[]).join() !== a.roles.join()) {
        a.roles = roles as string[];
        revokeSessionsOf(a.id);
      }
      recordAudit(me, 'staff.update', `staff:${a.id}`, { roles: a.roles });
      return HttpResponse.json(staffRow(a));
    }),
  ),

  http.post(p('admin/staff/:id/disable'), ({ request, params }) =>
    onStaff(request, params.id, (a, me) => {
      if (a.id === me.staffId) return apiError(409, 'You cannot do this to your own account.', 'SELF_ACTION');
      if (leavesNoOwner(a, { disabled: true })) return lastOwner();
      a.disabled = true;
      revokeSessionsOf(a.id);
      recordAudit(me, 'staff.disable', `staff:${a.id}`);
      return HttpResponse.json(staffRow(a));
    }),
  ),

  http.post(p('admin/staff/:id/enable'), ({ request, params }) =>
    onStaff(request, params.id, (a, me) => {
      if (a.id === me.staffId) return apiError(409, 'You cannot do this to your own account.', 'SELF_ACTION');
      a.disabled = false;
      recordAudit(me, 'staff.enable', `staff:${a.id}`);
      return HttpResponse.json(staffRow(a));
    }),
  ),

  http.post(p('admin/staff/:id/reset-password'), ({ request, params }) =>
    onStaff(request, params.id, (a, me) => {
      const temp = temporaryPassword();
      a.password = temp;
      a.mustChangePassword = true;
      a.failures = 0;
      a.lockedUntil = null;
      revokeSessionsOf(a.id);
      recordAudit(me, 'staff.reset_password', `staff:${a.id}`);
      return HttpResponse.json({ temporaryPassword: temp });
    }),
  ),

  http.post(p('admin/staff/:id/reset-mfa'), ({ request, params }) =>
    onStaff(request, params.id, (a, me) => {
      a.mfaSecret = null;
      a.pendingSecret = null;
      a.recoveryCodes = [];
      revokeSessionsOf(a.id);
      recordAudit(me, 'staff.reset_mfa', `staff:${a.id}`);
      return HttpResponse.json(staffRow(a));
    }),
  ),

  http.get(p('admin/staff/:id/sessions'), ({ request, params }) =>
    guard(request, 'staff.read', () => {
      const a = findStaff(params.id);
      if (!a) return staffNotFound();
      return HttpResponse.json(
        [...db().staff.sessions.values()]
          .filter((s) => s.staffId === a.id)
          .map((s) => ({
            id: s.id.slice(0, 12),
            createdAt: s.createdAt,
            lastSeenAt: s.lastSeenAt,
            userAgent: s.userAgent,
          })),
      );
    }),
  ),

  http.delete(p('admin/staff/:id/sessions'), ({ request, params }) =>
    onStaff(request, params.id, (a, me) => {
      revokeSessionsOf(a.id);
      recordAudit(me, 'staff.revoke_sessions', `staff:${a.id}`);
      return new HttpResponse(null, { status: 204 });
    }),
  ),

  http.get(p('admin/permissions'), ({ request }) =>
    guard(request, 'staff.read', () =>
      HttpResponse.json(
        PERMISSIONS.map((key) => {
          const v = PERMISSION_CATALOG[key] as PermissionInfo;
          return { key, group: v.group, label: v.label, ownerOnly: !!v.ownerOnly };
        }),
      ),
    ),
  ),

  http.get(p('admin/roles'), ({ request }) => guard(request, 'staff.read', () => HttpResponse.json(rolesView()))),

  http.post(p('admin/roles'), ({ request }) =>
    guard(request, 'roles.manage', async (me) => {
      const { key, name, description, permissions } = await readJson<{
        key?: string;
        name?: string;
        description?: string;
        permissions?: unknown[];
      }>(request);
      if (!key || !ROLE_KEY_RE.test(key)) return badRequest('key must match [a-z][a-z0-9_]{2,39}');
      if (!name?.trim()) return badRequest('name is required');
      if (roleExists(key)) return apiError(409, 'A role with this key exists.', 'ROLE_EXISTS');
      const problems = customRoleProblems(permissions ?? []);
      if (problems.length) return apiError(400, 'Invalid permissions.', 'INVALID_PERMISSIONS', { details: problems });
      const role = {
        key,
        name: name.trim(),
        description: description?.trim() ?? '',
        permissions: permissions as Permission[],
      };
      db().staff.customRoles.push(role);
      recordAudit(me, 'role.create', `role:${key}`, { permissions: role.permissions });
      return HttpResponse.json({ ...role, builtin: false, holders: 0 }, { status: 201 });
    }),
  ),

  http.patch(p('admin/roles/:key'), ({ request, params }) =>
    guard(request, 'roles.manage', async (me) => {
      const key = String(params.key);
      if (isBuiltinRole(key)) return apiError(409, 'Built-in roles cannot change.', 'BUILTIN_ROLE');
      const role = db().staff.customRoles.find((r) => r.key === key);
      if (!role) return apiError(404, 'No such role.', 'ROLE_NOT_FOUND');
      const { name, description, permissions } = await readJson<{
        name?: string;
        description?: string;
        permissions?: unknown[];
      }>(request);
      if (permissions !== undefined) {
        const problems = customRoleProblems(permissions);
        if (problems.length) return apiError(400, 'Invalid permissions.', 'INVALID_PERMISSIONS', { details: problems });
        role.permissions = permissions as Permission[];
      }
      if (name !== undefined) role.name = name.trim();
      if (description !== undefined) role.description = description.trim();
      for (const a of db().staff.accounts) if (a.roles.includes(key)) revokeSessionsOf(a.id);
      recordAudit(me, 'role.update', `role:${key}`, { permissions: role.permissions });
      return HttpResponse.json(rolesView().find((r) => r.key === key));
    }),
  ),

  http.delete(p('admin/roles/:key'), ({ request, params }) =>
    guard(request, 'roles.manage', (me) => {
      const key = String(params.key);
      if (isBuiltinRole(key)) return apiError(409, 'Built-in roles cannot be deleted.', 'BUILTIN_ROLE');
      const i = db().staff.customRoles.findIndex((r) => r.key === key);
      if (i < 0) return apiError(404, 'No such role.', 'ROLE_NOT_FOUND');
      if (db().staff.accounts.some((a) => a.roles.includes(key)))
        return apiError(409, 'Someone holds this role.', 'ROLE_IN_USE');
      db().staff.customRoles.splice(i, 1);
      recordAudit(me, 'role.delete', `role:${key}`);
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];
