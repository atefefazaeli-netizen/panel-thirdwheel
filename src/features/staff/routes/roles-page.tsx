import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon, LockIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import {
  Can,
  ConfirmDialog,
  ErrorState,
  FormDialog,
  FormFieldCheckboxGroup,
  FormFieldText,
  FormFieldTextarea,
  PageHeader,
} from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ApiError, errorMessage } from '@/lib/api';
import { usePermissionCatalog, useRoleActions, useRoles } from '../api/queries';
import { localCatalog } from '../api/staff-api';
import type { CatalogPermission, RoleView } from '../api/types';
import { roleSchema, type RoleValues } from '../schemas/staff';

function groupsOf(catalog: CatalogPermission[]) {
  const groups: { label: string; values: string[] }[] = [];
  for (const p of catalog) {
    let g = groups.find((x) => x.label === p.group);
    if (!g) groups.push((g = { label: p.group, values: [] }));
    g.values.push(p.key);
  }
  return groups;
}

/** INVALID_PERMISSIONS carries the problems in `details`. */
function roleError(e: unknown): string {
  if (e instanceof ApiError && e.code === 'INVALID_PERMISSIONS' && Array.isArray(e.details) && e.details.length)
    return `${errorMessage(e)} ${(e.details as string[]).join(' ')}`;
  return errorMessage(e);
}

export function RolesPage() {
  const roles = useRoles();
  const catalog = usePermissionCatalog().data ?? localCatalog();
  const [editing, setEditing] = React.useState<RoleView | 'new' | null>(null);
  const builtin = roles.data?.filter((r) => r.builtin) ?? [];
  const custom = roles.data?.filter((r) => !r.builtin) ?? [];
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/staff">
          <ArrowLeftIcon />
          Staff accounts
        </Link>
      </Button>
      <PageHeader
        title="Roles"
        description="A staff account holds the permissions of all its roles. Built-in roles are fixed; custom roles are built from the permission catalog."
        actions={
          <Can perm="roles.manage">
            <Button onClick={() => setEditing('new')}>
              <PlusIcon />
              New custom role
            </Button>
          </Can>
        }
      />
      {roles.error ? (
        <ErrorState error={roles.error} onRetry={() => void roles.refetch()} />
      ) : !roles.data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <section aria-labelledby="custom-roles" className="flex flex-col gap-3">
            <h2 id="custom-roles" className="text-lg font-semibold">
              Custom roles
            </h2>
            {custom.length === 0 ? (
              <p className="text-sm text-muted-foreground">No custom roles yet.</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {custom.map((r) => (
                  <RoleCard key={r.key} role={r} catalog={catalog} onEdit={() => setEditing(r)} />
                ))}
              </div>
            )}
          </section>
          <section aria-labelledby="builtin-roles" className="flex flex-col gap-3">
            <h2 id="builtin-roles" className="text-lg font-semibold">
              Built-in roles
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {builtin.map((r) => (
                <RoleCard key={r.key} role={r} catalog={catalog} />
              ))}
            </div>
          </section>
        </>
      )}
      <RoleDialog role={editing} catalog={catalog} onClose={() => setEditing(null)} />
    </>
  );
}

function RoleCard({ role, catalog, onEdit }: { role: RoleView; catalog: CatalogPermission[]; onEdit?: () => void }) {
  const { remove } = useRoleActions();
  const label = (k: string) => catalog.find((p) => p.key === k)?.label ?? k;
  return (
    <Card data-testid={`role-${role.key}`}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {role.name}
          {role.builtin && (
            <Badge variant="secondary" className="gap-1">
              <LockIcon className="size-3" aria-hidden />
              Built-in
            </Badge>
          )}
          <Badge variant="outline">
            {role.holders} {role.holders === 1 ? 'holder' : 'holders'}
          </Badge>
        </CardTitle>
        <CardDescription>
          <span className="font-mono text-xs">{role.key}</span>
          {role.description && <> · {role.description}</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <details>
          <summary className="cursor-pointer text-sm">{role.permissions.length} permissions</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
            {role.permissions.map((p) => (
              <li key={p}>
                {label(p)} <span className="font-mono text-xs">({p})</span>
              </li>
            ))}
          </ul>
        </details>
        {!role.builtin && (
          <Can perm="roles.manage">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onEdit}>
                <PencilIcon />
                Edit
              </Button>
              {role.holders > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} aria-label="Remove it from every account first">
                      <Button variant="outline" size="sm" disabled>
                        <Trash2Icon />
                        Delete
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Someone holds this role. Remove it from every account first.</TooltipContent>
                </Tooltip>
              ) : (
                <ConfirmDialog
                  title={`Delete ${role.name}?`}
                  description="Nobody holds it. It can't be restored, but you can make it again."
                  confirmLabel="Delete role"
                  cancelLabel="Keep role"
                  destructive
                  onConfirm={async () => {
                    try {
                      await remove.mutateAsync(role.key);
                      toast.success('Role deleted');
                    } catch (e) {
                      toast.error(roleError(e));
                      throw e;
                    }
                  }}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Trash2Icon />
                      Delete
                    </Button>
                  }
                />
              )}
            </div>
          </Can>
        )}
      </CardContent>
    </Card>
  );
}

function RoleDialog({
  role,
  catalog,
  onClose,
}: {
  role: RoleView | 'new' | null;
  catalog: CatalogPermission[];
  onClose: () => void;
}) {
  const { create, update } = useRoleActions();
  const isNew = role === 'new';
  const current = role && role !== 'new' ? role : null;
  const options = catalog.map((p) => ({
    value: p.key,
    label: p.label,
    description: p.key,
    // Owner-only permissions can't be in a custom role (STAFF_API.md §3).
    disabled: p.ownerOnly,
    hint: p.ownerOnly ? 'Owner only' : undefined,
  }));
  return (
    <FormDialog<RoleValues>
      open={!!role}
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? 'New custom role' : `Edit ${current?.name ?? ''}`}
      description={
        isNew
          ? 'Pick what the role may do. Owner-only permissions stay with the Owner role.'
          : 'Saving signs out everyone who holds this role, so their next sign-in uses the new permissions.'
      }
      schema={roleSchema}
      defaultValues={{
        key: current?.key ?? '',
        name: current?.name ?? '',
        description: current?.description ?? '',
        permissions: current?.permissions ?? [],
      }}
      submitLabel={isNew ? 'Create role' : 'Save role'}
      onSubmit={async (v) => {
        try {
          if (isNew) await create.mutateAsync({ ...v, description: v.description || undefined });
          else await update.mutateAsync({ ...v, description: v.description || undefined });
          toast.success(isNew ? 'Role created' : 'Role saved');
        } catch (e) {
          toast.error(roleError(e));
          throw e;
        }
      }}
    >
      {(form) => (
        <>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <FormFieldText
              control={form.control}
              name="key"
              label="Key"
              disabled={!isNew}
              description="Lower case, used in the API. Can't change later."
              maxLength={40}
            />
            <FormFieldText control={form.control} name="name" label="Name" maxLength={60} />
          </div>
          <FormFieldTextarea control={form.control} name="description" label="Description" rows={2} maxLength={300} />
          <FormFieldCheckboxGroup
            control={form.control}
            name="permissions"
            label="Permissions"
            options={options}
            groups={groupsOf(catalog)}
          />
        </>
      )}
    </FormDialog>
  );
}
