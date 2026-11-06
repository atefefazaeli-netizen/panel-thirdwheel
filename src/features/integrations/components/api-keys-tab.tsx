import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRoundIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  Can,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FormFieldText,
  SecretReveal,
  StatusBadge,
} from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { formatDate, formatRelative } from '@/lib/format';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '../api/queries';
import { API_KEY_SCOPES, type ApiKey } from '../api/types';
import { SCOPE_LABEL } from '../lib/labels';
import { apiKeySchema } from '../schemas/integrations';

function CreateKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateApiKey();
  const [key, setKey] = React.useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { name: '', scopes: ['content.import'] as ('users.flag' | 'content.import')[] },
  });
  React.useEffect(() => {
    if (open) form.reset({ name: '', scopes: ['content.import'] });
  }, [open, form]);
  const submit = form.handleSubmit(async (v) => {
    try {
      const r = await create.mutateAsync(v);
      setKey(r.key);
    } catch (e) {
      form.setError('root', { message: errorMessage(e) });
    }
  });
  return (
    <Dialog open={open} onOpenChange={(o) => (key ? undefined : onOpenChange(o))}>
      <DialogContent
        showCloseButton={!key}
        onEscapeKeyDown={(e) => key && e.preventDefault()}
        onPointerDownOutside={(e) => key && e.preventDefault()}
      >
        {key ? (
          <>
            <DialogHeader>
              <DialogTitle>Your new API key</DialogTitle>
              <DialogDescription>
                n8n sends it as the X-Api-Key header to POST /api/v1/integrations/n8n/action.
              </DialogDescription>
            </DialogHeader>
            <SecretReveal
              label="API key"
              secret={key}
              onDone={() => {
                setKey(null);
                onOpenChange(false);
              }}
            />
          </>
        ) : (
          <Form {...form}>
            <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
              <DialogHeader>
                <DialogTitle>New API key</DialogTitle>
                <DialogDescription>
                  For n8n to call Thirdwheel. Give each workflow its own key with only the scopes it needs.
                </DialogDescription>
              </DialogHeader>
              <FormFieldText
                control={form.control}
                name="name"
                label="Name"
                placeholder="n8n clinician sheets"
                maxLength={80}
              />
              <FormField
                control={form.control}
                name="scopes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scopes</FormLabel>
                    {API_KEY_SCOPES.map((s) => (
                      <label key={s} className="flex items-center gap-2 text-sm">
                        <FormControl>
                          <Checkbox
                            checked={field.value.includes(s)}
                            onCheckedChange={(c) =>
                              field.onChange(c ? [...field.value, s] : field.value.filter((x) => x !== s))
                            }
                            aria-label={s}
                          />
                        </FormControl>
                        <span className="font-mono text-xs">{SCOPE_LABEL[s]}</span>
                      </label>
                    ))}
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.formState.errors.root && (
                <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  Create key
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeysTab() {
  const keys = useApiKeys();
  const revoke = useRevokeApiKey();
  const [creating, setCreating] = React.useState(false);
  const [revoking, setRevoking] = React.useState<ApiKey | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Incoming keys for n8n actions. The server keeps only a hash; the key is shown once.
        </p>
        <Can perm="integrations.manage">
          <Button onClick={() => setCreating(true)}>
            <PlusIcon />
            New API key
          </Button>
        </Can>
      </div>
      {keys.error ? (
        <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
      ) : keys.isPending ? (
        <Skeleton className="h-32" />
      ) : keys.data.length === 0 ? (
        <EmptyState
          icon={KeyRoundIcon}
          title="No API keys"
          description="Create one for each n8n workflow that calls Thirdwheel."
        />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table aria-label="API keys">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.data.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="pl-4 font-medium">{k.name}</TableCell>
                    <TableCell className="font-mono text-xs">twk_{k.prefix}_…</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map((s) => (
                          <Badge key={s} variant="secondary" className="font-mono">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(k.createdAt)}</TableCell>
                    <TableCell>{k.lastUsedAt ? formatRelative(k.lastUsedAt) : 'Never'}</TableCell>
                    <TableCell>
                      {k.revokedAt ? <StatusBadge status="revoked" /> : <StatusBadge status="active" />}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      {!k.revokedAt && (
                        <Can perm="integrations.manage">
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setRevoking(k)}>
                            Revoke
                          </Button>
                        </Can>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <CreateKeyDialog open={creating} onOpenChange={setCreating} />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke ${revoking?.name}?`}
        description="Calls with this key fail at once with 401 API_KEY_INVALID. This cannot be undone."
        confirmLabel="Revoke key"
        cancelLabel="Keep key"
        destructive
        onConfirm={async () => {
          await revoke.mutateAsync(revoking!.id);
          toast.success('Key revoked');
        }}
      />
    </div>
  );
}
