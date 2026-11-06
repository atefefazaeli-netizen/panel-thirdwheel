import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { KeyRoundIcon } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { CopyButton, FormFieldText } from '@/components/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { authApi, type MfaSetup } from '../api/auth-api';
import { passwordOnlySchema, totpSchema, type PasswordOnlyValues, type TotpValues } from '../schemas/login';
import { OtpQr } from './otp-qr';
import { RecoveryCodes } from './recovery-codes';

/** Groups a base32 secret in fours so it can be typed by hand. */
const grouped = (s: string) => s.replace(/(.{4})/g, '$1 ').trim();

/**
 * TOTP enrollment (STAFF_API.md §2): confirm the password (`mfa/setup`), scan the QR code or type
 * the key, confirm one code (`mfa/enable`), then save the 10 recovery codes. Used by a restricted
 * session at sign-in and from My account.
 */
export function MfaEnroll({
  username,
  password,
  onDone,
  onCancel,
}: {
  username: string;
  /** The password typed at sign-in, if this follows it (no need to ask again). */
  password?: string;
  onDone: () => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [setup, setSetup] = React.useState<MfaSetup | null>(null);
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const start = useMutation({ mutationFn: (pw: string) => authApi.mfaSetup(pw), meta: { silent: true } });
  const enable = useMutation({ mutationFn: (code: string) => authApi.mfaEnable(code), meta: { silent: true } });
  const pwForm = useForm<PasswordOnlyValues>({
    resolver: zodResolver(passwordOnlySchema),
    defaultValues: { password: '' },
  });
  const codeForm = useForm<TotpValues, unknown, { code: string }>({
    resolver: zodResolver(totpSchema),
    defaultValues: { code: '' },
  });

  const begin = React.useCallback(
    async (pw: string) => {
      try {
        setSetup(await start.mutateAsync(pw));
      } catch (e) {
        pwForm.setError('password', { message: errorMessage(e) });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // After sign-in the password is known: start right away.
  const started = React.useRef(false);
  React.useEffect(() => {
    if (password && !started.current) {
      started.current = true;
      void begin(password);
    }
  }, [password, begin]);

  if (codes) return <RecoveryCodes codes={codes} username={username} onDone={() => void onDone()} />;

  if (!setup) {
    if (password && !pwForm.formState.errors.password) return <Skeleton className="h-48" aria-label="Preparing" />;
    return (
      <Form {...pwForm}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={pwForm.handleSubmit(({ password: pw }) => begin(pw))}
        >
          <FormFieldText
            control={pwForm.control}
            name="password"
            type="password"
            label="Confirm your password"
            autoComplete="current-password"
          />
          <div className="flex gap-2">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={pwForm.formState.isSubmitting}>
              Continue
            </Button>
          </div>
        </form>
      </Form>
    );
  }

  const confirm = codeForm.handleSubmit(async ({ code }) => {
    try {
      const r = await enable.mutateAsync(code);
      setCodes(r.recoveryCodes);
    } catch (e) {
      codeForm.setError('code', { message: errorMessage(e) });
    }
  });

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
        <li>Open an authenticator app (1Password, Google Authenticator, Microsoft Authenticator, Authy).</li>
        <li>Scan the code, or type the key by hand.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="flex justify-center">
        <OtpQr value={setup.otpauthUrl} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Key</span>
        <div className="flex items-center gap-2">
          <code
            className="flex-1 rounded-md border bg-muted/40 px-2 py-1.5 font-mono text-sm break-all"
            data-testid="totp-secret"
          >
            {grouped(setup.secret)}
          </code>
          <CopyButton value={setup.secret} iconOnly label="Copy key" />
        </div>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show the setup link</summary>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 rounded-md border bg-muted/40 px-2 py-1.5 font-mono text-xs break-all">
            {setup.otpauthUrl}
          </code>
          <CopyButton value={setup.otpauthUrl} iconOnly label="Copy setup link" />
        </div>
      </details>
      <Alert>
        <KeyRoundIcon />
        <AlertDescription>
          Keep this key private. Anyone with it can make sign-in codes for your account.
        </AlertDescription>
      </Alert>
      <Form {...codeForm}>
        <form onSubmit={confirm} className="flex flex-col gap-4" noValidate>
          <FormFieldText
            control={codeForm.control}
            name="code"
            label="Code from the app"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
          />
          <div className="flex gap-2">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={codeForm.formState.isSubmitting}>
              Turn on two-factor sign-in
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
