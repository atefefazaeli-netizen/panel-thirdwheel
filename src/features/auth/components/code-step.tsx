import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { authApi, needsBirthday } from '../api/auth-api';
import { codeFailureMessage, codeSchema, type CodeValues } from '../schemas/login';

export interface CodeStepProps {
  email: string;
  session: string;
  resendAt: number;
  onResent: (resendAt: number) => void;
  onVerified: (tokens: { token: string; refreshToken: string; expiresIn: number }) => Promise<void>;
  /** First sign-in: the API asks the birthday before it creates the account (adults only). */
  onBirthdayRequired: (ticket: string, ticketExpiresAt: number) => void;
  onBack: () => void;
}

function useSecondsUntil(at: number) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.ceil((at - now) / 1000));
}

export function CodeStep({
  email,
  session,
  resendAt,
  onResent,
  onVerified,
  onBirthdayRequired,
  onBack,
}: CodeStepProps) {
  const form = useForm<CodeValues>({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } });
  const wait = useSecondsUntil(resendAt);
  const [locked, setLocked] = React.useState(false);

  const submit = form.handleSubmit(async ({ code }) => {
    try {
      const r = await authApi.verify(session, code);
      if (!r.ok) {
        setLocked(r.locked || r.code === 'CODE_EXPIRED');
        form.setError('code', { message: codeFailureMessage(r.code, r.attempts) });
        return;
      }
      if (needsBirthday(r)) {
        onBirthdayRequired(r.ticket, r.ticketExpiresAt);
        return;
      }
      await onVerified(r);
    } catch (e) {
      form.setError('code', { message: errorMessage(e) });
    }
  });

  const resend = async () => {
    try {
      const r = await authApi.resend(session);
      setLocked(false);
      form.reset({ code: '' });
      onResent(r.resendAt);
      toast.success(`New code sent to ${email}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>6-digit code</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  placeholder="000000"
                  className="h-11 text-center font-mono text-lg tracking-[0.5em]"
                  onChange={(e) => field.onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </FormControl>
              <FormDescription>We sent it to {email}.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting || locked}>
          {form.formState.isSubmitting ? 'Checking…' : 'Sign in'}
        </Button>
        <div className="flex items-center justify-between gap-2 text-sm">
          <Button type="button" variant="link" className="h-auto px-0" onClick={onBack}>
            Use another email
          </Button>
          <Button type="button" variant="link" className="h-auto px-0" onClick={resend} disabled={wait > 0 && !locked}>
            {wait > 0 && !locked ? `Resend in ${wait}s` : 'Resend code'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
