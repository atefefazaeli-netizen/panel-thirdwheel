import { zodResolver } from '@hookform/resolvers/zod';
import { CakeIcon } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { FormFieldText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ApiError, errorMessage } from '@/lib/api';
import { authApi } from '../api/auth-api';
import { birthdayFailureMessage, birthdaySchema, type BirthdayValues } from '../schemas/login';

interface BirthdayStepProps {
  ticket: string;
  onVerified: (tokens: { token: string; refreshToken: string; expiresIn: number }) => Promise<void>;
  /** The ticket is gone (expired, used, or under 18): start again from the email. */
  onRestart: () => void;
}

/**
 * First sign-in since API v1.6.0: Thirdwheel accounts are adults only, so the API creates the
 * account after the code only with an 18+ birthday (POST auth/signup/complete). Staff signing in
 * to the panel for the first time follow the same rule; nothing is stored for under 18.
 */
export function BirthdayStep({ ticket, onVerified, onRestart }: BirthdayStepProps) {
  const form = useForm<BirthdayValues>({ resolver: zodResolver(birthdaySchema), defaultValues: { birthday: '' } });
  const [ended, setEnded] = React.useState<string | null>(null);

  const submit = form.handleSubmit(async ({ birthday }) => {
    try {
      await onVerified(await authApi.completeSignup(ticket, birthday));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : null;
      if (code === 'UNDER_18' || code === 'SIGNUP_TICKET_INVALID') {
        setEnded(birthdayFailureMessage(code));
        return;
      }
      form.setError('birthday', { message: code ? birthdayFailureMessage(code) : errorMessage(e) });
    }
  });

  if (ended) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-sm">
          {ended}
        </p>
        <Button type="button" variant="outline" onClick={onRestart}>
          Start again
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <p className="text-sm text-muted-foreground">
          This is your first sign-in. Thirdwheel accounts are for adults, so the API asks your birthday once before it
          creates the account.
        </p>
        <FormFieldText control={form.control} name="birthday" label="Birthday" type="date" autoComplete="bday" />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          <CakeIcon />
          Continue
        </Button>
      </form>
    </Form>
  );
}
