import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { InfoIcon } from 'lucide-react';
import * as React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DemoBanner, ThemeToggle } from '@/components/shared';
import { env } from '@/config/env';
import { useSession } from '@/stores/session';
import { completeSignIn } from '../api/session';
import { CodeStep } from '../components/code-step';
import { EmailStep } from '../components/email-step';
import { NoAccess } from '../components/no-access';

const route = getRouteApi('/login');

type Step = { kind: 'email' } | { kind: 'code'; email: string; session: string; resendAt: number };

const ENDED_COPY: Record<string, string> = {
  suspended: 'This account is suspended.',
  refresh_failed: 'Your session ended. Sign in again.',
};

export function LoginPage() {
  const { redirect } = route.useSearch();
  const navigate = useNavigate();
  const status = useSession((s) => s.status);
  const deniedEmail = useSession((s) => s.deniedEmail);
  const endedReason = useSession((s) => s.endedReason);
  const [step, setStep] = React.useState<Step>({ kind: 'email' });
  const [lastEmail, setLastEmail] = React.useState<string>();

  const back = () => {
    useSession.getState().signOut(null);
    setStep({ kind: 'email' });
  };

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      {env.useMocks && <DemoBanner className="fixed inset-x-0 top-0 z-30" />}
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
        {status === 'noAccess' ? (
          <CardContent>
            <NoAccess email={deniedEmail} onBack={back} />
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="text-lg">{step.kind === 'email' ? 'Sign in' : 'Check your email'}</CardTitle>
              <CardDescription>
                {step.kind === 'email'
                  ? 'Staff sign in with a one-time code. No passwords.'
                  : 'Enter the code to finish signing in.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {endedReason && ENDED_COPY[endedReason] && step.kind === 'email' && (
                <Alert variant="destructive">
                  <InfoIcon />
                  <AlertDescription>{ENDED_COPY[endedReason]}</AlertDescription>
                </Alert>
              )}
              {step.kind === 'email' ? (
                <EmailStep
                  defaultEmail={lastEmail}
                  onSent={(email, session, resendAt) => {
                    setLastEmail(email);
                    setStep({ kind: 'code', email, session, resendAt });
                  }}
                />
              ) : (
                <CodeStep
                  email={step.email}
                  session={step.session}
                  resendAt={step.resendAt}
                  onResent={(resendAt) => setStep({ ...step, resendAt })}
                  onBack={() => setStep({ kind: 'email' })}
                  onVerified={async (tokens) => {
                    const result = await completeSignIn(tokens, step.email);
                    if (result === 'signedIn') await navigate({ to: redirect ?? '/', replace: true });
                    else setStep({ kind: 'email' });
                  }}
                />
              )}
            </CardContent>
          </>
        )}
      </Card>
      {env.useMocks && (
        <Alert className="max-w-sm">
          <InfoIcon />
          <AlertTitle>Demo sign-in (mock API)</AlertTitle>
          <AlertDescription>
            <p>
              Any email, code <span className="font-mono font-semibold">123456</span>. Use{' '}
              <span className="font-mono">admin-only@…</span> or <span className="font-mono">clinician@…</span> for one
              role, <span className="font-mono">nostaff@…</span> for no access.
            </p>
          </AlertDescription>
        </Alert>
      )}
    </main>
  );
}
