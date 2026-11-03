import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangleIcon } from 'lucide-react';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

export interface DangerConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** What the person must type, e.g. the account email. Compared case-insensitively. */
  confirmText: string;
  /** "Type the email to confirm". */
  inputLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Receives what was typed (the API checks it again). Reject to keep the dialog open. */
  onConfirm: (typed: string) => unknown | Promise<unknown>;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Type-to-confirm for actions that cannot be undone. */
export function DangerConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  inputLabel,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
}: DangerConfirmDialogProps) {
  const schema = React.useMemo(
    () =>
      z.object({
        typed: z.string().refine((v) => norm(v) === norm(confirmText), { message: 'This does not match.' }),
      }),
    [confirmText],
  );
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { typed: '' },
    mode: 'onChange',
  });
  const typed = useWatch({ control: form.control, name: 'typed' });
  const matches = norm(typed) === norm(confirmText);
  const pending = form.formState.isSubmitting;

  const submit = form.handleSubmit(async ({ typed: value }) => {
    try {
      await onConfirm(value.trim());
      form.reset();
      onOpenChange(false);
    } catch {
      // Stay open; the mutation shows the error.
    }
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (pending) return;
        if (!v) form.reset();
        onOpenChange(v);
      }}
    >
      <AlertDialogContent>
        <Form {...form}>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangleIcon className="size-5 text-destructive" aria-hidden />
                {title}
              </AlertDialogTitle>
              {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
            </AlertDialogHeader>
            <FormField
              control={form.control}
              name="typed"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {inputLabel ?? 'Type'}&nbsp;<span className="font-mono font-semibold">{confirmText}</span>
                  </FormLabel>
                  <FormControl>
                    <Input autoComplete="off" spellCheck={false} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={pending}>
                {cancelLabel}
              </AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={!matches || pending}>
                {pending ? 'Working…' : confirmLabel}
              </Button>
            </AlertDialogFooter>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
