import {
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  WebhookIcon,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, ErrorState, SecretReveal, StatusBadge } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import {
  useCreateWebhook,
  useDeleteWebhook,
  useRotateSecret,
  useTestWebhook,
  useUpdateWebhook,
  useWebhooks,
} from '../api/queries';
import type { Webhook } from '../api/types';
import { EVENT_LABEL } from '../lib/labels';
import { SignatureHelp } from './signature-help';
import { WebhookFormDialog } from './webhook-form-dialog';

type Dialog =
  | null
  | { kind: 'create' }
  | { kind: 'edit'; webhook: Webhook }
  | { kind: 'delete'; webhook: Webhook }
  | { kind: 'rotate'; webhook: Webhook };

export function WebhooksTab({ onShowDeliveries }: { onShowDeliveries: (webhookId: string) => void }) {
  const hooks = useWebhooks();
  const create = useCreateWebhook();
  const update = useUpdateWebhook();
  const remove = useDeleteWebhook();
  const rotate = useRotateSecret();
  const test = useTestWebhook();
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [secret, setSecret] = React.useState<{ name: string; secret: string } | null>(null);

  const sendTest = async (w: Webhook) => {
    try {
      await test.mutateAsync(w.id);
      toast.success('Test ping queued', { action: { label: 'See deliveries', onClick: () => onShowDeliveries(w.id) } });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Outgoing events for n8n. Each webhook has its own signing secret.
        </p>
        <Button onClick={() => setDialog({ kind: 'create' })}>
          <PlusIcon />
          New webhook
        </Button>
      </div>
      {hooks.error ? (
        <ErrorState error={hooks.error} onRetry={() => void hooks.refetch()} />
      ) : hooks.isPending ? (
        <Skeleton className="h-40" />
      ) : hooks.data.length === 0 ? (
        <EmptyState
          icon={WebhookIcon}
          title="No webhooks yet"
          description="Add one to send crisis alerts, support tickets or content changes to n8n."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {hooks.data.map((w) => (
            <Card key={w.id} className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2">
                  {w.name}
                  {!w.enabled && <StatusBadge status="disabled" />}
                </CardTitle>
                <CardDescription className="truncate font-mono text-xs" title={w.url}>
                  {w.url}
                </CardDescription>
                <CardAction>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${w.name}`}>
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', webhook: w })}>
                          <PencilIcon />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void sendTest(w)}>
                          <SendIcon />
                          Send test
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setDialog({ kind: 'rotate', webhook: w })}>
                          <KeyRoundIcon />
                          Rotate secret
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog({ kind: 'delete', webhook: w })}
                      >
                        <Trash2Icon />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 px-4">
                <div className="flex flex-wrap gap-1">
                  {w.events.map((e) => (
                    <Badge key={e} variant="secondary">
                      {EVENT_LABEL[e]}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                    <span>
                      Last delivery: {w.lastDeliveryAt ? formatRelative(w.lastDeliveryAt) : 'never'}{' '}
                      {w.lastStatus && <StatusBadge status={w.lastStatus} className="ml-1" />}
                    </span>
                    <span className="font-mono text-xs">secret …{w.secretHint}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`enabled-${w.id}`}
                      checked={w.enabled}
                      disabled={update.isPending}
                      onCheckedChange={(enabled) =>
                        void update.mutateAsync({ id: w.id, patch: { enabled } }).then(
                          () => toast.success(enabled ? 'Webhook enabled' : 'Webhook disabled'),
                          (e: unknown) => toast.error(errorMessage(e)),
                        )
                      }
                    />
                    <Label htmlFor={`enabled-${w.id}`}>Enabled</Label>
                  </div>
                </div>
                <Button
                  variant="link"
                  className="h-auto self-start p-0 text-sm text-info underline"
                  onClick={() => onShowDeliveries(w.id)}
                >
                  Deliveries for this webhook
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <SignatureHelp />

      <WebhookFormDialog
        open={dialog?.kind === 'create' || dialog?.kind === 'edit'}
        onOpenChange={(o) => !o && setDialog(null)}
        webhook={dialog?.kind === 'edit' ? dialog.webhook : null}
        onSubmit={async (v) => {
          if (dialog?.kind === 'edit') {
            await update.mutateAsync({ id: dialog.webhook.id, patch: v });
            toast.success('Webhook saved');
          } else {
            const r = await create.mutateAsync(v);
            setSecret({ name: r.webhook.name, secret: r.secret });
          }
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete ${dialog?.kind === 'delete' ? dialog.webhook.name : 'webhook'}?`}
        description="It stops getting events now. Its deliveries stay in the log until they expire; queued retries fail."
        confirmLabel="Delete webhook"
        cancelLabel="Keep webhook"
        destructive
        onConfirm={async () => {
          if (dialog?.kind !== 'delete') return;
          await remove.mutateAsync(dialog.webhook.id);
          toast.success('Webhook deleted');
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'rotate'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Rotate the signing secret?"
        description="The old secret stops working at once. Update n8n with the new one right away, or its signature checks fail."
        confirmLabel="Rotate secret"
        cancelLabel="Keep current secret"
        onConfirm={async () => {
          if (dialog?.kind !== 'rotate') return;
          const r = await rotate.mutateAsync(dialog.webhook.id);
          setSecret({ name: r.webhook.name, secret: r.secret });
        }}
      />
      <Dialog open={!!secret} onOpenChange={() => undefined}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Signing secret for {secret?.name}</DialogTitle>
            <DialogDescription>
              Put it in n8n as THIRDWHEEL_WEBHOOK_SECRET and use it to check X-Thirdwheel-Signature.
            </DialogDescription>
          </DialogHeader>
          {secret && <SecretReveal label="Signing secret" secret={secret.secret} onDone={() => setSecret(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
