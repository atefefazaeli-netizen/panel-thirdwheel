import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { FormFieldSwitch, FormFieldText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ApiError, errorMessage } from '@/lib/api';
import { WEBHOOK_EVENTS, type Webhook } from '../api/types';
import { EVENT_HELP, EVENT_LABEL } from '../lib/labels';
import { webhookSchema, type WebhookForm } from '../schemas/integrations';

export interface WebhookFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhook?: Webhook | null;
  onSubmit: (v: WebhookForm) => Promise<unknown>;
}

/** Create or edit a webhook: name, https URL, events and enabled. */
export function WebhookFormDialog({ open, onOpenChange, webhook, onSubmit }: WebhookFormDialogProps) {
  const form = useForm<WebhookForm>({
    resolver: zodResolver(webhookSchema),
    defaultValues: { name: '', url: '', events: ['crisis.alert'], enabled: true },
  });
  React.useEffect(() => {
    if (open)
      form.reset(
        webhook
          ? { name: webhook.name, url: webhook.url, events: webhook.events, enabled: webhook.enabled }
          : { name: '', url: '', events: ['crisis.alert'], enabled: true },
      );
  }, [open, webhook, form]);

  const submit = form.handleSubmit(async (v) => {
    try {
      await onSubmit(v);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'WEBHOOK_URL_INVALID') form.setError('url', { message: e.message });
      else form.setError('root', { message: errorMessage(e) });
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !form.formState.isSubmitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-xl">
        <Form {...form}>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>{webhook ? 'Edit webhook' : 'New webhook'}</DialogTitle>
              <DialogDescription>
                Thirdwheel POSTs a signed JSON event to this URL. Production needs https and a public host.
              </DialogDescription>
            </DialogHeader>
            <FormFieldText
              control={form.control}
              name="name"
              label="Name"
              placeholder="On-call crisis alerts"
              maxLength={80}
            />
            <FormFieldText
              control={form.control}
              name="url"
              label="URL"
              type="url"
              placeholder="https://n8n.example.com/webhook/thirdwheel"
            />
            <FormField
              control={form.control}
              name="events"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Events</FormLabel>
                  <div className="flex flex-col gap-2">
                    {WEBHOOK_EVENTS.map((ev) => {
                      const checked = field.value.includes(ev);
                      return (
                        <label
                          key={ev}
                          className="flex cursor-pointer items-start gap-3 rounded-md border p-2.5 hover:bg-muted/50"
                        >
                          <FormControl>
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) =>
                                field.onChange(c ? [...field.value, ev] : field.value.filter((x) => x !== ev))
                              }
                              aria-label={EVENT_LABEL[ev]}
                              className="mt-0.5"
                            />
                          </FormControl>
                          <span className="flex flex-col">
                            <span className="text-sm font-medium">
                              {EVENT_LABEL[ev]} <span className="font-mono text-xs text-muted-foreground">{ev}</span>
                            </span>
                            <span className="text-xs text-muted-foreground">{EVENT_HELP[ev]}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormFieldSwitch
              control={form.control}
              name="enabled"
              label="Enabled"
              description="Disabled webhooks get no events (a test ping still goes out)."
            />
            {form.formState.errors.root && (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {webhook ? 'Save webhook' : 'Create webhook'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
