import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ShieldCheckIcon } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { FormFieldText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ApiError, errorMessage } from '@/lib/api';
import { authApi, type LoginResult } from '../api/auth-api';
import { recoverySchema, totpSchema, type RecoveryValues, type TotpValues } from '../schemas/login';

/**
 * Second step for an account with two-factor sign-in: a 6-digit authenticator code, or one of the
 * recovery codes. The challenge lasts 5 minutes and dies after 5 wrong codes: then start again.
 */
export function MfaStep({
  challenge,
  onResult,
  onRestart,
}: {
  challenge: string;
  onResult: (r: LoginResult) => void | Promise<void>;
  onRestart: (message: string) => void;
}) {
  const [mode, setMode] = React.useState<'code' | 'recovery'>('code');
  const verify = useMutation({
    mutationFn: (proof: { code: string } | { recoveryCode: string }) => authApi.loginMfa(challenge, proof),
    meta: { silent: true },
  });
  const codeForm = useForm<TotpValues, unknown, { code: string }>({
    resolver: zodResolver(totpSchema),
    defaultValues: { code: '' },
  });
  const recForm = useForm<RecoveryValues>({
    resolver: zodResolver(recoverySchema),
    defaultValues: { recoveryCode: '' },
  });

  const run = async (proof: { code: string } | { recoveryCode: string }, fail: (m: string) => void) => {
    try {
      await onResult(await verify.mutateAsync(proof));
    } catch (e) {
      // A dead or expired challenge cannot be retried: back to the password.
      if (e instanceof ApiError && e.status === 401 && e.code !== 'MFA_INVALID') {
        onRestart(errorMessage(new ApiError('http', { status: 401, body: { code: 'MFA_CHALLENGE_EXPIRED' } })));
        return;
      }
      fail(errorMessage(e));
    }
  };

  return mode === 'code' ? (
    <Form {...codeForm}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={codeForm.handleSubmit((v) =>
          run(v, (m) => {
            codeForm.setValue('code', '');
            codeForm.setError('code', { message: m });
          }),
        )}
      >
        <FormFieldText
          control={codeForm.control}
          name="code"
          label="Authenticator code"
          description="The 6-digit code your authenticator app shows for Thirdwheel."
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
        />
        <Button type="submit" disabled={codeForm.formState.isSubmitting}>
          <ShieldCheckIcon />
          Verify
        </Button>
        <Button type="button" variant="link" className="self-start px-0" onClick={() => setMode('recovery')}>
          Use a recovery code instead
        </Button>
      </form>
    </Form>
  ) : (
    <Form {...recForm}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={recForm.handleSubmit((v) => run(v, (m) => recForm.setError('recoveryCode', { message: m })))}
      >
        <FormFieldText
          control={recForm.control}
          name="recoveryCode"
          label="Recovery code"
          description="Each recovery code works once. Make new ones from My account afterwards."
          autoComplete="off"
          maxLength={64}
        />
        <Button type="submit" disabled={recForm.formState.isSubmitting}>
          <ShieldCheckIcon />
          Verify
        </Button>
        <Button type="button" variant="link" className="self-start px-0" onClick={() => setMode('code')}>
          Use an authenticator code instead
        </Button>
      </form>
    </Form>
  );
}
