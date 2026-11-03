import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm, type DefaultValues, type FieldValues, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';

export interface FormDialogProps<TValues extends FieldValues> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  schema: z.ZodType<TValues, TValues>;
  defaultValues: DefaultValues<TValues>;
  /** Resolve to close; reject to keep the dialog open. */
  onSubmit: (values: TValues) => unknown | Promise<unknown>;
  submitLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  children: (form: UseFormReturn<TValues>) => React.ReactNode;
}

/** A small dialog with a React Hook Form + Zod form (suspend reason, note, tags, days). */
export function FormDialog<TValues extends FieldValues>({
  open,
  onOpenChange,
  title,
  description,
  schema,
  defaultValues,
  onSubmit,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  destructive,
  children,
}: FormDialogProps<TValues>) {
  const form = useForm<TValues>({ resolver: zodResolver(schema), defaultValues });
  const pending = form.formState.isSubmitting;

  React.useEffect(() => {
    if (open) form.reset(defaultValues);
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch {
      // Keep the values; the mutation shows the error.
    }
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent>
        <Form {...form}>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
            <div className="flex flex-col gap-4">{children(form)}</div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                {cancelLabel}
              </Button>
              <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={pending}>
                {pending ? 'Working…' : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
