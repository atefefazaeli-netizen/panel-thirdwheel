import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { MailIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { FormFieldText } from '@/components/shared';
import { errorMessage } from '@/lib/api';
import { authApi } from '../api/auth-api';
import { emailSchema, type EmailValues } from '../schemas/login';

export function EmailStep({
  defaultEmail,
  onSent,
}: {
  defaultEmail?: string;
  onSent: (email: string, session: string, resendAt: number) => void;
}) {
  const form = useForm<EmailValues, unknown, { email: string }>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: defaultEmail ?? '' },
  });
  const start = useMutation({ mutationFn: (email: string) => authApi.start(email), meta: { silent: true } });

  const submit = form.handleSubmit(async ({ email }) => {
    try {
      const r = await start.mutateAsync(email);
      if (r.ok) onSent(email, r.session, r.resendAt);
      else
        form.setError('email', {
          message: 'Could not send a code to this email.',
        });
    } catch (e) {
      form.setError('email', { message: errorMessage(e) });
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormFieldText
          control={form.control}
          name="email"
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="you@thirdwheel.app"
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          <MailIcon />
          {form.formState.isSubmitting ? 'Sending…' : 'Send me a code'}
        </Button>
      </form>
    </Form>
  );
}
