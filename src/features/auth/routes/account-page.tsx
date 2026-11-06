import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { LogOutIcon, MonitorSmartphoneIcon, ShieldCheckIcon, ShieldOffIcon } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDialog, ErrorState, FormDialog, FormFieldText, PageHeader, StatusBadge } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { mfaRequired, useSession, type StaffMe } from '@/stores/session';
import { authApi } from '../api/auth-api';
import { signOut } from '../api/session';
import { MfaEnroll } from '../components/mfa-enroll';
import { PasswordForm } from '../components/password-form';
import { RecoveryCodes } from '../components/recovery-codes';
import { disableMfaSchema, totpSchema, type DisableMfaValues, type TotpValues } from '../schemas/login';

const sessionsKey = ['staff-auth', 'sessions'] as const;

/** Re-reads the session so `mfaEnabled` and the permissions follow a change made here. */
const refreshSession = () => authApi.session().catch(() => undefined);

export function AccountPage() {
  const staff = useSession((s) => s.staff);
  if (!staff) return null;
  return (
    <>
      <PageHeader title="My account" description="Your staff account: password, two-factor sign-in and sessions." />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileCard staff={staff} />
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Changing it signs you out everywhere else.</CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm
              username={staff.username}
              onDone={async () => {
                toast.success('Password changed. Your other sessions are signed out.');
                await refreshSession();
              }}
            />
          </CardContent>
        </Card>
        <MfaCard staff={staff} />
        <SessionsCard />
      </div>
    </>
  );
}

function ProfileCard({ staff }: { staff: StaffMe }) {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>An Owner changes your name and roles.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Name</dt>
          <dd>{staff.displayName}</dd>
          <dt className="text-muted-foreground">Username</dt>
          <dd className="font-mono">{staff.username}</dd>
          <dt className="text-muted-foreground">Roles</dt>
          <dd className="flex flex-wrap gap-1">
            {staff.roles.map((r) => (
              <Badge key={r} variant="secondary" className="capitalize">
                {r.replace(/_/g, ' ')}
              </Badge>
            ))}
          </dd>
          <dt className="text-muted-foreground">Last sign-in</dt>
          <dd>{formatDateTime(staff.lastLoginAt)}</dd>
        </dl>
        <Button
          variant="outline"
          className="self-start"
          onClick={async () => {
            await signOut();
            await navigate({ to: '/login' });
          }}
        >
          <LogOutIcon />
          Sign out
        </Button>
      </CardContent>
    </Card>
  );
}

function MfaCard({ staff }: { staff: StaffMe }) {
  const [mode, setMode] = React.useState<'idle' | 'enroll' | 'regenerate'>('idle');
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = React.useState(false);
  const required = mfaRequired(staff);
  const regenerate = useMutation({
    mutationFn: (code: string) => authApi.regenerateRecoveryCodes(code),
    meta: { silent: true },
  });
  const disable = useMutation({
    mutationFn: (v: { password: string; code: string }) => authApi.mfaDisable(v.password, v.code),
  });
  const codeForm = useForm<TotpValues, unknown, { code: string }>({
    resolver: zodResolver(totpSchema),
    defaultValues: { code: '' },
  });

  let body: React.ReactNode;
  if (codes) {
    body = (
      <RecoveryCodes
        codes={codes}
        username={staff.username}
        doneLabel="Done"
        onDone={() => {
          setCodes(null);
          setMode('idle');
        }}
      />
    );
  } else if (mode === 'enroll') {
    body = (
      <MfaEnroll
        username={staff.username}
        onCancel={() => setMode('idle')}
        onDone={async () => {
          await refreshSession();
          setMode('idle');
          toast.success('Two-factor sign-in is on.');
        }}
      />
    );
  } else if (mode === 'regenerate') {
    body = (
      <Form {...codeForm}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={codeForm.handleSubmit(async ({ code }) => {
            try {
              setCodes((await regenerate.mutateAsync(code)).recoveryCodes);
              codeForm.reset();
            } catch (e) {
              codeForm.setError('code', { message: errorMessage(e) });
            }
          })}
        >
          <p className="text-sm text-muted-foreground">
            New codes replace every old one. Confirm with a code from your authenticator app.
          </p>
          <FormFieldText
            control={codeForm.control}
            name="code"
            label="Authenticator code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setMode('idle')}>
              Cancel
            </Button>
            <Button type="submit" disabled={codeForm.formState.isSubmitting}>
              Make new codes
            </Button>
          </div>
        </form>
      </Form>
    );
  } else if (staff.mfaEnabled) {
    body = (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setMode('regenerate')}>
          Make new recovery codes
        </Button>
        {!required && (
          <Button variant="outline" onClick={() => setDisableOpen(true)}>
            <ShieldOffIcon />
            Turn off
          </Button>
        )}
      </div>
    );
  } else {
    body = (
      <Button className="self-start" onClick={() => setMode('enroll')}>
        <ShieldCheckIcon />
        Turn on two-factor sign-in
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Two-factor sign-in
          <StatusBadge status={staff.mfaEnabled ? 'on' : 'off'} label={staff.mfaEnabled ? 'On' : 'Off'} />
        </CardTitle>
        <CardDescription>
          {required
            ? 'Required for your role: it cannot be turned off. An Owner can reset it if you lose your phone and codes.'
            : 'A code from an authenticator app at every sign-in, on top of your password.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{body}</CardContent>
      <FormDialog<DisableMfaValues>
        open={disableOpen}
        onOpenChange={setDisableOpen}
        title="Turn off two-factor sign-in?"
        description="Your password alone will sign you in. Your recovery codes stop working."
        schema={disableMfaSchema as never}
        defaultValues={{ password: '', code: '' }}
        submitLabel="Turn off"
        cancelLabel="Keep it on"
        destructive
        onSubmit={async (v) => {
          await disable.mutateAsync({ password: v.password, code: v.code.replace(/\s+/g, '') });
          await refreshSession();
          toast.success('Two-factor sign-in is off.');
        }}
      >
        {(form) => (
          <>
            <FormFieldText
              control={form.control}
              name="password"
              type="password"
              label="Password"
              autoComplete="current-password"
            />
            <FormFieldText
              control={form.control}
              name="code"
              label="Authenticator code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
            />
          </>
        )}
      </FormDialog>
    </Card>
  );
}

function SessionsCard() {
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: sessionsKey, queryFn: authApi.sessions });
  const revoke = useMutation({
    mutationFn: (id: string) => authApi.revokeSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionsKey }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>Where you are signed in. Sign out a session you do not recognise.</CardDescription>
      </CardHeader>
      <CardContent>
        {sessions.error ? (
          <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
        ) : !sessions.data ? (
          <Skeleton className="h-24" />
        ) : (
          <ul className="flex flex-col divide-y" aria-label="Your sessions">
            {sessions.data.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2">
                <MonitorSmartphoneIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{s.userAgent ?? 'Unknown browser'}</span>
                  <span className="text-xs text-muted-foreground">
                    Signed in {formatDateTime(s.createdAt)} · last seen {formatRelative(s.lastSeenAt)}
                  </span>
                </div>
                {s.current ? (
                  <Badge variant="secondary">This browser</Badge>
                ) : (
                  <ConfirmDialog
                    title="Sign out this session?"
                    description="That browser will need your password again."
                    confirmLabel="Sign it out"
                    cancelLabel="Keep it"
                    destructive
                    onConfirm={async () => {
                      await revoke.mutateAsync(s.id);
                      toast.success('Session signed out');
                    }}
                    trigger={
                      <Button variant="outline" size="sm">
                        Revoke
                      </Button>
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
