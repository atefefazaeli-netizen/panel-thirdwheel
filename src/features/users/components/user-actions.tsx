import { useNavigate } from '@tanstack/react-router';
import {
  BanIcon,
  CrownIcon,
  HeartCrackIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  ShieldCheckIcon,
  TagIcon,
  Trash2Icon,
  XCircleIcon,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  DangerConfirmDialog,
  FormDialog,
  FormFieldNumber,
  FormFieldTags,
  FormFieldTextarea,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate } from '@/lib/format';
import { useCan } from '@/stores/session';
import {
  useDeleteUser,
  useEndGrant,
  useGrantPlus,
  useSetUserTags,
  useSignOutUser,
  useSuspendUser,
  useUnlinkUser,
  useUnsuspendUser,
} from '../api/queries';
import type { AdminUserDetail } from '../api/types';
import { grantSchema, normalizeTag, suspendSchema, tagsSchema } from '../schemas/users';

type Dialog = null | 'signout' | 'suspend' | 'unsuspend' | 'tags' | 'grant' | 'endGrant' | 'unlink' | 'delete';

/** Account actions for one user. No password reset (there are no passwords) and no trial (product rule). */
export function UserActions({ user }: { user: AdminUserDetail }) {
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const close = (o: boolean) => !o && setDialog(null);
  const navigate = useNavigate();
  const id = user.account.userId;
  // One permission per action (STAFF_API.md §4). Staff are not app users, so there is no "self".
  const can = {
    signout: useCan('users.signout'),
    suspend: useCan('users.suspend'),
    tags: useCan('users.tags'),
    plus: useCan('users.plus'),
    unlink: useCan('users.unlink'),
    del: useCan('users.delete'),
  };
  const who = user.profile?.name ?? user.account.email ?? id;

  const signOut = useSignOutUser();
  const suspend = useSuspendUser();
  const unsuspend = useUnsuspendUser();
  const setTags = useSetUserTags();
  const grant = useGrantPlus();
  const endGrant = useEndGrant();
  const unlink = useUnlinkUser();
  const remove = useDeleteUser();

  if (!Object.values(can).some(Boolean)) return null;
  const showAccount = can.signout || can.suspend || can.tags;
  const showPlus = can.plus;
  const showOther = (can.unlink && !!user.couple) || can.del;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <MoreHorizontalIcon />
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {showAccount && (
            <>
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuGroup>
                {can.signout && (
                  <DropdownMenuItem onSelect={() => setDialog('signout')}>
                    <LogOutIcon />
                    Sign out everywhere
                  </DropdownMenuItem>
                )}
                {can.suspend &&
                  (user.account.suspended ? (
                    <DropdownMenuItem onSelect={() => setDialog('unsuspend')}>
                      <ShieldCheckIcon />
                      Unsuspend
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => setDialog('suspend')}>
                      <BanIcon />
                      Suspend
                    </DropdownMenuItem>
                  ))}
                {can.tags && (
                  <DropdownMenuItem onSelect={() => setDialog('tags')}>
                    <TagIcon />
                    Edit tags
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </>
          )}
          {showPlus && (
            <>
              {showAccount && <DropdownMenuSeparator />}
              <DropdownMenuLabel>Plus</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => setDialog('grant')}>
                  <CrownIcon />
                  {user.subscription?.grant ? 'Extend grant' : 'Grant Plus'}
                </DropdownMenuItem>
                {user.subscription?.grant && (
                  <DropdownMenuItem onSelect={() => setDialog('endGrant')}>
                    <XCircleIcon />
                    End grant
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </>
          )}
          {showOther && (
            <>
              {(showAccount || showPlus) && <DropdownMenuSeparator />}
              <DropdownMenuGroup>
                {can.unlink && user.couple && (
                  <DropdownMenuItem onSelect={() => setDialog('unlink')}>
                    <HeartCrackIcon />
                    Unlink partner
                  </DropdownMenuItem>
                )}
                {can.del && (
                  <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
                    <Trash2Icon />
                    Delete account
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={dialog === 'signout'}
        onOpenChange={close}
        title="Sign out everywhere?"
        description={`Every device ${who} uses signs out. They sign in again with a new code.`}
        confirmLabel="Sign out everywhere"
        cancelLabel="Keep signed in"
        onConfirm={async () => {
          await signOut.mutateAsync(id);
          toast.success('Signed out everywhere');
        }}
      />
      <FormDialog
        open={dialog === 'suspend'}
        onOpenChange={close}
        title={`Suspend ${who}?`}
        description="They are signed out now and can't sign in until unsuspended. Their partner is not affected."
        schema={suspendSchema}
        defaultValues={{ reason: '' }}
        submitLabel="Suspend"
        destructive
        onSubmit={async ({ reason }) => {
          await suspend.mutateAsync({ id, reason });
          toast.success('Account suspended');
        }}
      >
        {(f) => (
          <FormFieldTextarea control={f.control} name="reason" label="Reason (staff only)" rows={3} maxLength={300} />
        )}
      </FormDialog>
      <ConfirmDialog
        open={dialog === 'unsuspend'}
        onOpenChange={close}
        title="Unsuspend this account?"
        description={user.account.suspendedReason ? `Suspended for: “${user.account.suspendedReason}”.` : undefined}
        confirmLabel="Unsuspend"
        cancelLabel="Keep suspended"
        onConfirm={async () => {
          await unsuspend.mutateAsync(id);
          toast.success('Account unsuspended');
        }}
      />
      <FormDialog
        open={dialog === 'tags'}
        onOpenChange={close}
        title="Tags"
        description="Short labels for staff and n8n (for example beta, press, vip)."
        schema={tagsSchema}
        defaultValues={{ tags: user.account.tags }}
        submitLabel="Save tags"
        onSubmit={async ({ tags }) => {
          await setTags.mutateAsync({ id, tags });
          toast.success('Tags saved');
        }}
      >
        {(f) => (
          <FormFieldTags
            control={f.control}
            name="tags"
            label="Tags"
            max={20}
            normalize={normalizeTag}
            suggestions={['beta', 'press', 'vip', 'churn-risk']}
          />
        )}
      </FormDialog>
      <FormDialog
        open={dialog === 'grant'}
        onOpenChange={close}
        title="Grant Plus"
        description={`Plus by staff grant from today. One plan covers both partners${user.couple ? `, so ${user.couple.partner.name ?? 'the partner'} gets it too` : ''}. There is no trial.`}
        schema={grantSchema}
        defaultValues={{ days: 30, note: '' }}
        submitLabel="Grant Plus"
        onSubmit={async ({ days, note }) => {
          await grant.mutateAsync({ id, days, note: note || undefined });
          toast.success(`Plus granted for ${days} days`);
        }}
      >
        {(f) => (
          <>
            <FormFieldNumber
              control={f.control}
              name="days"
              label="Days"
              min={1}
              max={365}
              suffix="days"
              description="1 to 365."
            />
            <FormFieldTextarea control={f.control} name="note" label="Note (optional)" rows={2} maxLength={200} />
          </>
        )}
      </FormDialog>
      <ConfirmDialog
        open={dialog === 'endGrant'}
        onOpenChange={close}
        title="End the Plus grant now?"
        description={
          user.subscription?.grant
            ? `The grant runs until ${formatDate(user.subscription.grant.until)}. A store subscription, if any, is not touched.`
            : undefined
        }
        confirmLabel="End grant"
        cancelLabel="Keep the grant"
        destructive
        onConfirm={async () => {
          await endGrant.mutateAsync(id);
          toast.success('Grant ended');
        }}
      />
      <ConfirmDialog
        open={dialog === 'unlink'}
        onOpenChange={close}
        title="Unlink this couple?"
        description={`The same as ${who} ending the relationship in the app: shared plans and Plus sharing stop for both.`}
        confirmLabel="Unlink partner"
        cancelLabel="Keep them linked"
        destructive
        onConfirm={async () => {
          const r = await unlink.mutateAsync(id);
          toast.success(r.unlinked ? 'Unlinked' : 'They were not linked');
        }}
      />
      <DangerConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={close}
        title="Delete this account?"
        description="This erases the account the same way self-deletion does. It cannot be undone."
        confirmText={user.account.email ?? id}
        inputLabel="Type the email to confirm:"
        confirmLabel="Delete account"
        cancelLabel="Keep account"
        onConfirm={async (typed) => {
          await remove.mutateAsync({ id, confirmEmail: typed });
          toast.success('Account deleted');
          await navigate({ to: '/users' });
        }}
      />
    </>
  );
}
