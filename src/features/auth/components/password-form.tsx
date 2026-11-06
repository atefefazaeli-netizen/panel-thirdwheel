import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { FormFieldText } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ApiError, errorMessage } from '@/lib/api';
import { authApi } from '../api/auth-api';
import { newPasswordSchema, PASSWORD_MIN, weakPasswordDetails, type NewPasswordValues } from '../schemas/login';

/**
 * Change password (`POST staff/auth/password`). The server signs out every other session. Used by a
 * restricted session (temporary password) and from My account.
 */
export function PasswordForm({
  username,
  currentPassword,
  submitLabel = 'Change password',
  onDone,
}: {
  username: string;
  /** Known from the sign-in step: the field is not shown. */
  currentPassword?: string;
  submitLabel?: string;
  onDone: () => void | Promise<void>;
}) {
  const needCurrent = !currentPassword;
  const schema = React.useMemo(() => newPasswordSchema(username, needCurrent), [username, needCurrent]);
  const form = useForm<NewPasswordValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });
  const change = useMutation({
    mutationFn: (v: NewPasswordValues) => authApi.changePassword(currentPassword ?? v.currentPassword, v.newPassword),
    meta: { silent: true },
  });
  const [weak, setWeak] = React.useState<string[] | null>(null);

  const submit = form.handleSubmit(async (v) => {
    setWeak(null);
    try {
      await change.mutateAsync(v);
      form.reset();
      await onDone();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'WEAK_PASSWORD') {
        setWeak(weakPasswordDetails(e.details));
        form.setError('newPassword', { message: errorMessage(e) });
      } else if (e instanceof ApiError && e.code === 'INVALID_CREDENTIALS') {
        form.setError(needCurrent ? 'currentPassword' : 'newPassword', {
          message: 'The current password is not right.',
        });
      } else form.setError('newPassword', { message: errorMessage(e) });
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {needCurrent && (
          <FormFieldText
            control={form.control}
            name="currentPassword"
            type="password"
            label="Current password"
            autoComplete="current-password"
          />
        )}
        <FormFieldText
          control={form.control}
          name="newPassword"
          type="password"
          label="New password"
          autoComplete="new-password"
          description={`${PASSWORD_MIN} to 128 characters, not containing your username. A long passphrase works well.`}
        />
        <FormFieldText
          control={form.control}
          name="confirm"
          type="password"
          label="New password again"
          autoComplete="new-password"
        />
        {weak && weak.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>The server refused this password</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {weak.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
