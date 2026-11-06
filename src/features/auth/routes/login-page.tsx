import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { InfoIcon } from 'lucide-react';
import * as React from 'react';
import { ThemeToggle } from '@/components/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { devUi } from '@/config/dev-ui';
import { errorMessage } from '@/lib/api';
import { useSession } from '@/stores/session';
import { authApi, type LoginResult } from '../api/auth-api';
import { signOut } from '../api/session';
import { CredentialsStep } from '../components/credentials-step';
import { MfaEnroll } from '../components/mfa-enroll';
import { MfaStep } from '../components/mfa-step';
import { PasswordForm } from '../components/password-form';

const route = getRouteApi('/login');

type Step = { kind: 'credentials' } | { kind: 'mfa'; challenge: string };

const ENDED_COPY: Record<string, string> = {
  expired: 'Your session ended. Sign in again.',
};

export function LoginPage() {
  const { redirect } = route.useSearch();
  const navigate = useNavigate();
  const status = useSession((s) => s.status);
  const restricted = useSession((s) => s.restricted);
  const staff = useSession((s) => s.staff);
  const endedReason = useSession((s) => s.endedReason);
  const [step, setStep] = React.useState<Step>({ kind: 'credentials' });
  const [notice, setNotice] = React.useState<string | null>(null);
  // The password typed in this tab, kept only in memory for the setup steps that ask for it
  // again (MFA setup, password change). Never stored anywhere.
  const [password, setPassword] = React.useState<string | undefined>(undefined);
  const { LoginHint } = devUi();

  const enter = () => navigate({ to: redirect ?? '/', replace: true });

  const onLogin = async (r: LoginResult) => {
    setNotice(null);
    if (r.status === 'mfa_required') setStep({ kind: 'mfa', challenge: r.challenge });
    else if (r.status === 'ok') await enter();
    // mfa_enrollment_required / password_change_required: the session store is now restricted and
    // this page shows that step.
  };

  /** A setup step finished: read the session again (the next restriction, or none). */
  const afterSetup = async () => {
    try {
      const info = await authApi.session();
      if (!info.restricted) await enter();
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };

  const startOver = async () => {
    setPassword(undefined);
    await signOut();
    setStep({ kind: 'credentials' });
  };

  let title = 'Sign in';
  let description = 'Staff sign in with the username and password an Owner gave them.';
  let body: React.ReactNode;

  if (status === 'restricted' && staff && restricted === 'mfa_enrollment') {
    title = 'Set up two-factor sign-in';
    description = 'Your role needs a code from an authenticator app at every sign-in. This takes a minute.';
    body = <MfaEnroll username={staff.username} password={password} onDone={afterSetup} />;
  } else if (status === 'restricted' && staff && restricted === 'password_change') {
    title = 'Choose a new password';
    description = 'You signed in with a temporary password. Choose your own to continue.';
    body = (
      <PasswordForm
        username={staff.username}
        currentPassword={password}
        submitLabel="Save and continue"
        onDone={async () => {
          setPassword(undefined);
          await afterSetup();
        }}
      />
    );
  } else if (step.kind === 'mfa') {
    title = 'Two-factor sign-in';
    description = 'Enter the code from your authenticator app.';
    body = (
      <MfaStep
        challenge={step.challenge}
        onResult={onLogin}
        onRestart={(m) => {
          setNotice(m);
          setStep({ kind: 'credentials' });
        }}
      />
    );
  } else {
    body = (
      <CredentialsStep
        onResult={(r, v) => {
          setPassword(v.password);
          return onLogin(r);
        }}
      />
    );
  }

  const ended = endedReason ? ENDED_COPY[endedReason] : null;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 32 32" className="size-10" aria-hidden>
          <rect width="32" height="32" rx="8" className="fill-primary" />
          <circle cx="12" cy="16" r="5" fill="none" stroke="white" strokeWidth="2.5" />
          <circle cx="20" cy="16" r="5" fill="none" stroke="var(--brand)" strokeWidth="2.5" />
        </svg>
        <div className="flex flex-col leading-tight">
          <span className="text-xl font-bold">Thirdwheel</span>
          <span className="text-sm text-muted-foreground">Admin and content panel</span>
        </div>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-lg">{title}</h1>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {(notice || (ended && step.kind === 'credentials' && status === 'signedOut')) && (
            <Alert>
              <InfoIcon />
              <AlertDescription>{notice ?? ended}</AlertDescription>
            </Alert>
          )}
          {body}
          {(status === 'restricted' || step.kind === 'mfa') && (
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => void startOver()}>
              Sign out and start again
            </Button>
          )}
        </CardContent>
      </Card>
      {LoginHint && step.kind === 'credentials' && status !== 'restricted' && <LoginHint />}
    </main>
  );
}
