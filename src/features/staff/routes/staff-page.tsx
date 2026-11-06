import { getRouteApi, Link } from '@tanstack/react-router';
import {
  KeyRoundIcon,
  LogOutIcon,
  PencilIcon,
  ShieldOffIcon,
  UserCheckIcon,
  UserPlusIcon,
  UserXIcon,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import {
  Can,
  columnHelper,
  ConfirmDialog,
  DataTable,
  DrawerPreview,
  FormDialog,
  FormFieldCheckboxGroup,
  FormFieldText,
  PageHeader,
  SecretReveal,
  StatusBadge,
} from '@/components/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cleanSearch } from '@/lib/search';
import { useSession } from '@/stores/session';
import { useRoles, useStaffActions, useStaffList, useStaffSessions } from '../api/queries';
import type { RoleView, StaffRow } from '../api/types';
import { createStaffSchema, editStaffSchema, type CreateStaffValues, type EditStaffValues } from '../schemas/staff';

const route = getRouteApi('/_app/staff/');
const h = columnHelper<StaffRow>();

const roleName = (key: string, roles: RoleView[] | undefined) => roles?.find((r) => r.key === key)?.name ?? key;
const isLocked = (s: StaffRow) => !!s.lockedUntil && Date.parse(s.lockedUntil) > Date.now();

function useColumns(roles: RoleView[] | undefined) {
  return h.columns([
    h.accessor('displayName', {
      header: 'Name',
      enableHiding: false,
      meta: { label: 'Name' },
      cell: (c) => (
        <span className="flex flex-col">
          <span className="font-medium">{c.getValue()}</span>
          <span className="font-mono text-xs text-muted-foreground">{c.row.original.username}</span>
        </span>
      ),
    }),
    h.accessor('roles', {
      header: 'Roles',
      meta: { label: 'Roles' },
      cell: (c) => (
        <span className="flex flex-wrap gap-1">
          {c.getValue().map((k) => (
            <Badge key={k} variant="secondary">
              {roleName(k, roles)}
            </Badge>
          ))}
        </span>
      ),
    }),
    h.display({
      id: 'state',
      header: 'Status',
      meta: { label: 'Status' },
      cell: (c) => {
        const s = c.row.original;
        return (
          <span className="flex flex-wrap gap-1">
            {s.disabled ? <StatusBadge status="disabled" /> : <StatusBadge status="active" />}
            {isLocked(s) && <StatusBadge status="locked" />}
            {s.mustChangePassword && <StatusBadge status="pending" label="Temporary password" />}
          </span>
        );
      },
    }),
    h.accessor('mfaEnabled', {
      header: 'Two-factor',
      meta: { label: 'Two-factor' },
      cell: (c) => <StatusBadge status={c.getValue() ? 'on' : 'off'} />,
    }),
    h.accessor('lastLoginAt', {
      header: 'Last sign-in',
      meta: { label: 'Last sign-in' },
      cell: (c) => <span className="text-sm text-muted-foreground">{formatRelative(c.getValue())}</span>,
    }),
  ]);
}

/** The temporary password, shown once (create and reset). */
function TemporaryPassword({ value, who, onDone }: { value: string | null; who: string; onDone: () => void }) {
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Temporary password for {who}</DialogTitle>
          <DialogDescription>
            Give it to them in person or over a channel you trust. They choose their own password at the next sign-in.
          </DialogDescription>
        </DialogHeader>
        {value && (
          <SecretReveal label="Temporary password" secret={value} onDone={onDone} doneLabel="I handed it over" />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function StaffPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const list = useStaffList();
  const roles = useRoles().data;
  const columns = useColumns(roles);
  const actions = useStaffActions();
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [secret, setSecret] = React.useState<{ value: string; who: string } | null>(null);
  const page = search.page ?? 1;
  const limit = search.limit ?? 20;
  const q = (search.q ?? '').toLowerCase();
  const rows = (list.data ?? []).filter((s) => !q || s.username.includes(q) || s.displayName.toLowerCase().includes(q));
  const open = list.data?.find((s) => s.id === search.id) ?? null;

  const set = (patch: Partial<typeof search>, resetPage = true) =>
    navigate({
      search: (prev) => cleanSearch({ ...prev, ...(resetPage ? { page: undefined } : {}), ...patch }),
      replace: true,
    });

  const roleOptions = (roles ?? []).map((r) => ({ value: r.key, label: r.name, description: r.description }));

  return (
    <>
      <PageHeader
        title="Staff accounts"
        description="Who can sign in to this panel, with which roles. Staff accounts are separate from app accounts."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/staff/roles">
                <KeyRoundIcon />
                Roles
              </Link>
            </Button>
            <Can perm="staff.manage">
              <Button onClick={() => setCreating(true)}>
                <UserPlusIcon />
                Add staff
              </Button>
            </Can>
          </>
        }
      />
      <DataTable
        id="staff"
        label="Staff accounts"
        columns={columns}
        data={list.data ? rows.slice((page - 1) * limit, page * limit) : undefined}
        getRowId={(r) => r.id}
        page={page}
        pageSize={limit}
        total={rows.length}
        onPageChange={(p) => set({ page: p }, false)}
        onPageSizeChange={(l) => set({ limit: l })}
        loading={list.isPending}
        fetching={list.isFetching}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(r) => set({ id: r.id }, false)}
        toolbar={{
          search: {
            value: search.q ?? '',
            onChange: (v) => set({ q: v || undefined }),
            placeholder: 'Search name or username',
            label: 'Search staff',
          },
        }}
        empty={{ title: 'No staff accounts match', description: 'Try another name.' }}
      />
      <DrawerPreview
        open={!!open}
        onOpenChange={(o) => !o && set({ id: undefined }, false)}
        title={open?.displayName ?? 'Staff account'}
        description={open ? <span className="font-mono">{open.username}</span> : undefined}
      >
        {open && (
          <StaffDetail staff={open} roles={roles} onSecret={(value) => setSecret({ value, who: open.displayName })} />
        )}
      </DrawerPreview>

      <FormDialog<CreateStaffValues>
        open={creating}
        onOpenChange={(o) => {
          setCreating(o);
          setCreateError(null);
        }}
        title="Add a staff account"
        description="The server makes a temporary password. They must change it, and Owners set up two-factor, at the first sign-in."
        schema={createStaffSchema}
        defaultValues={{ username: '', displayName: '', roles: [] }}
        submitLabel="Create account"
        onSubmit={async (v) => {
          setCreateError(null);
          try {
            const r = await actions.create.mutateAsync(v);
            setSecret({ value: r.temporaryPassword, who: r.staff.displayName });
          } catch (e) {
            // USERNAME_TAKEN and validation errors stay in the dialog.
            setCreateError(errorMessage(e));
            throw e;
          }
        }}
      >
        {(form) => (
          <>
            <FormFieldText control={form.control} name="username" label="Username" autoComplete="off" maxLength={40} />
            <FormFieldText control={form.control} name="displayName" label="Name" maxLength={80} />
            <FormFieldCheckboxGroup control={form.control} name="roles" label="Roles" options={roleOptions} />
            {createError && (
              <Alert variant="destructive">
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}
          </>
        )}
      </FormDialog>
      <TemporaryPassword value={secret?.value ?? null} who={secret?.who ?? ''} onDone={() => setSecret(null)} />
    </>
  );
}

function StaffDetail({
  staff,
  roles,
  onSecret,
}: {
  staff: StaffRow;
  roles: RoleView[] | undefined;
  onSecret: (temporaryPassword: string) => void;
}) {
  const me = useSession((s) => s.staff);
  const self = me?.id === staff.id;
  const actions = useStaffActions();
  const sessions = useStaffSessions(staff.id);
  const [editing, setEditing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setError(null);
    try {
      await fn();
      toast.success(done);
    } catch (e) {
      // LAST_OWNER, SELF_ACTION, SELF_ROLE_CHANGE…: shown here and kept until the next action.
      setError(errorMessage(e));
      toast.error(errorMessage(e));
      throw e;
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Roles</dt>
        <dd className="flex flex-wrap gap-1">
          {staff.roles.map((k) => (
            <Badge key={k} variant="secondary">
              {roleName(k, roles)}
            </Badge>
          ))}
        </dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd className="flex flex-wrap gap-1">
          {staff.disabled ? <StatusBadge status="disabled" /> : <StatusBadge status="active" />}
          {isLocked(staff) && (
            <StatusBadge status="locked" label={`Locked until ${formatDateTime(staff.lockedUntil)}`} />
          )}
          {staff.mustChangePassword && <StatusBadge status="pending" label="Temporary password" />}
        </dd>
        <dt className="text-muted-foreground">Two-factor</dt>
        <dd>{staff.mfaEnabled ? 'On' : 'Off'}</dd>
        <dt className="text-muted-foreground">Last sign-in</dt>
        <dd>{formatDateTime(staff.lastLoginAt)}</dd>
        <dt className="text-muted-foreground">Created</dt>
        <dd>{formatDateTime(staff.createdAt)}</dd>
        <dt className="text-muted-foreground">Sessions</dt>
        <dd>{sessions.data ? `${sessions.data.length} active` : '…'}</dd>
      </dl>
      {self && (
        <p className="text-sm text-muted-foreground">
          This is your account. Another Owner changes your roles or disables it; your password and two-factor are in{' '}
          <Link to="/account" className="underline">
            My account
          </Link>
          .
        </p>
      )}
      <Can perm="staff.manage">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PencilIcon />
            {self ? 'Edit name' : 'Edit name and roles'}
          </Button>
          {!self &&
            (staff.disabled ? (
              <ConfirmDialog
                title={`Enable ${staff.displayName}?`}
                description="They can sign in again with their password."
                confirmLabel="Enable"
                cancelLabel="Keep disabled"
                onConfirm={() => run(() => actions.enable.mutateAsync(staff.id), 'Account enabled')}
                trigger={
                  <Button variant="outline" size="sm">
                    <UserCheckIcon />
                    Enable
                  </Button>
                }
              />
            ) : (
              <ConfirmDialog
                title={`Disable ${staff.displayName}?`}
                description="They are signed out everywhere and cannot sign in until an Owner enables the account."
                confirmLabel="Disable"
                cancelLabel="Keep active"
                destructive
                onConfirm={() => run(() => actions.disable.mutateAsync(staff.id), 'Account disabled')}
                trigger={
                  <Button variant="outline" size="sm">
                    <UserXIcon />
                    Disable
                  </Button>
                }
              />
            ))}
          {!self && (
            <ConfirmDialog
              title={`Reset the password of ${staff.displayName}?`}
              description="Their sessions end and they get a temporary password, shown once on the next screen."
              confirmLabel="Reset password"
              cancelLabel="Keep the password"
              destructive
              onConfirm={() =>
                run(
                  async () => onSecret((await actions.resetPassword.mutateAsync(staff.id)).temporaryPassword),
                  'Password reset',
                )
              }
              trigger={
                <Button variant="outline" size="sm">
                  <KeyRoundIcon />
                  Reset password
                </Button>
              }
            />
          )}
          {!self && staff.mfaEnabled && (
            <ConfirmDialog
              title={`Reset two-factor for ${staff.displayName}?`}
              description="Their authenticator and recovery codes stop working and their sessions end. Owners set it up again at the next sign-in."
              confirmLabel="Reset two-factor"
              cancelLabel="Keep it"
              destructive
              onConfirm={() => run(() => actions.resetMfa.mutateAsync(staff.id), 'Two-factor reset')}
              trigger={
                <Button variant="outline" size="sm">
                  <ShieldOffIcon />
                  Reset two-factor
                </Button>
              }
            />
          )}
          <ConfirmDialog
            title={self ? 'Sign yourself out everywhere?' : `Sign ${staff.displayName} out everywhere?`}
            description="Every session of this account ends, including this browser if it is yours."
            confirmLabel="Sign out everywhere"
            cancelLabel="Keep sessions"
            destructive
            onConfirm={() => run(() => actions.revokeSessions.mutateAsync(staff.id), 'Sessions ended')}
            trigger={
              <Button variant="outline" size="sm" disabled={!sessions.data?.length}>
                <LogOutIcon />
                Revoke sessions
              </Button>
            }
          />
        </div>
      </Can>
      <FormDialog<EditStaffValues>
        open={editing}
        onOpenChange={setEditing}
        title={self ? 'Edit your name' : `Edit ${staff.displayName}`}
        description={
          self
            ? 'You cannot change your own roles. Ask another Owner.'
            : 'A role change signs them out everywhere. Adding Owner asks for two-factor setup at the next sign-in.'
        }
        schema={editStaffSchema}
        defaultValues={{ displayName: staff.displayName, roles: staff.roles }}
        onSubmit={async (v) => {
          const rolesChanged = v.roles.join() !== staff.roles.join();
          await run(
            () =>
              actions.update.mutateAsync({
                id: staff.id,
                displayName: v.displayName !== staff.displayName ? v.displayName : undefined,
                roles: !self && rolesChanged ? v.roles : undefined,
              }),
            'Saved',
          );
        }}
      >
        {(form) => (
          <>
            <FormFieldText control={form.control} name="displayName" label="Name" maxLength={80} />
            <FormFieldCheckboxGroup
              control={form.control}
              name="roles"
              label="Roles"
              disabled={self}
              description={self ? 'Your own roles cannot be changed here.' : undefined}
              options={(roles ?? []).map((r) => ({ value: r.key, label: r.name, description: r.description }))}
            />
          </>
        )}
      </FormDialog>
    </div>
  );
}
