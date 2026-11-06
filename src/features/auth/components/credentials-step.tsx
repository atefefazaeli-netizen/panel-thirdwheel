import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { LogInIcon } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { FormFieldText } from '@/components/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { errorMessage } from '@/lib/api';
import { authApi, type LoginResult } from '../api/auth-api';
import { credentialsSchema, type CredentialsValues } from '../schemas/login';

/**
 * Username and password (STAFF_API.md §2). Wrong passwords, unknown usernames and disabled
 * accounts all read the same (401 INVALID_CREDENTIALS); a locked account says until when (423).
 */
export function CredentialsStep({
  onResult,
}: {
  onResult: (r: LoginResult, values: CredentialsValues) => void | Promise<void>;
}) {
  const form = useForm<CredentialsValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { username: '', password: '' },
  });
  const login = useMutation({
    mutationFn: (v: CredentialsValues) => authApi.login(v.username, v.password),
    meta: { silent: true },
  });
  const [failure, setFailure] = React.useState<string | null>(null);

  const submit = form.handleSubmit(async (v) => {
    setFailure(null);
    try {
      const r = await login.mutateAsync(v);
      await onResult(r, v);
    } catch (e) {
      form.setValue('password', '');
      setFailure(errorMessage(e));
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormFieldText control={form.control} name="username" label="Username" autoComplete="username" maxLength={40} />
        <FormFieldText
          control={form.control}
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          maxLength={128}
        />
        {failure && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          <LogInIcon />
          {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </Form>
  );
}
