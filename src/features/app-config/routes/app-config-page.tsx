import { zodResolver } from '@hookform/resolvers/zod';
import { getRouteApi } from '@tanstack/react-router';
import { ArrowRightIcon, History, RotateCcwIcon, SaveIcon, SendIcon, TriangleAlertIcon } from 'lucide-react';
import * as React from 'react';
import { useForm, useFormState } from 'react-hook-form';
import { toast } from 'sonner';
import {
  Can,
  ConfirmDialog,
  ErrorState,
  FormDialog,
  FormFieldSwitch,
  FormFieldText,
  FormFieldTextarea,
  PageHeader,
  StatusBadge,
} from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cleanSearch } from '@/lib/search';
import { useCan } from '@/stores/session';
import {
  isConfigConflict,
  useAppConfig,
  useConfigVersions,
  usePublishConfig,
  useRollbackConfig,
  useSaveConfigDraft,
} from '../api/queries';
import type { AppConfigAdmin, ConfigVersion } from '../api/types';
import { configDiff } from '../lib/diff';
import {
  configFormSchema,
  fromForm,
  MAINTENANCE_MAX,
  publishSchema,
  toForm,
  type ConfigFormValues,
  type PublishValues,
} from '../schemas/config';

const route = getRouteApi('/_app/app-config');

export function AppConfigPage() {
  const cfg = useAppConfig();
  return (
    <>
      <PageHeader
        title="Remote Config"
        description="What the app reads at start and when it comes back to the foreground: feature switches, the maintenance screen and version limits. Public values only, never secrets."
      />
      {cfg.error ? (
        <ErrorState error={cfg.error} onRetry={() => void cfg.refetch()} />
      ) : !cfg.data ? (
        <Skeleton className="h-96" />
      ) : (
        <Editor
          key={`${cfg.data.published.version}:${cfg.data.updatedAt ?? ''}`}
          data={cfg.data}
          onReload={() => void cfg.refetch()}
        />
      )}
      <HistoryCard current={cfg.data} />
    </>
  );
}

function Editor({ data, onReload }: { data: AppConfigAdmin; onReload: () => void }) {
  const canEdit = useCan('config.edit');
  const keys = data.features.map((f) => f.key);
  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configFormSchema),
    defaultValues: toForm(data.draft, keys),
    mode: 'onChange',
  });
  const { isDirty } = useFormState({ control: form.control });
  const [conflict, setConflict] = React.useState(false);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const save = useSaveConfigDraft();
  const publish = usePublishConfig();
  const baseVersion = data.published.version;

  // What publishing would change: the saved draft against the published config.
  const changes = configDiff(data.published, data.draft, data.features);

  const onConflict = (e: unknown) => {
    if (isConfigConflict(e)) setConflict(true);
    toast.error(errorMessage(e));
  };

  const onSave = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({ config: fromForm(v), baseVersion });
      toast.success('Draft saved. Nothing changes in the app until you publish.');
    } catch (e) {
      onConflict(e);
    }
  });

  return (
    <>
      {conflict && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Changed by someone else</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            Someone published or rolled back Remote Config since you opened it. Load the latest, then make your change
            again.
            <Button size="sm" variant="outline" onClick={onReload}>
              Load the latest
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Draft
              {isDirty ? (
                <StatusBadge status="editing" label="Unsaved edits" />
              ) : changes.length ? (
                <StatusBadge status="in_review" label="Differs from published" />
              ) : (
                <StatusBadge status="published" label="Same as published" />
              )}
            </CardTitle>
            <CardDescription>
              Based on published version {baseVersion}
              {data.updatedAt && (
                <>
                  {' '}
                  · draft saved {formatDateTime(data.updatedAt)}
                  {data.updatedByName ? ` by ${data.updatedByName}` : ''}
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={onSave} className="flex flex-col gap-6" noValidate>
                <fieldset className="flex flex-col gap-3" disabled={!canEdit}>
                  <legend className="mb-2 text-sm font-semibold">Feature switches</legend>
                  <p className="text-sm text-muted-foreground">
                    A switch only hides or removes an entry point in the app. It never grants access, skips consent or
                    changes a plan, and the API keeps its own checks.
                  </p>
                  {data.features.map((f) => (
                    <FormFieldSwitch
                      key={f.key}
                      control={form.control}
                      name={`features.${f.key}`}
                      label={f.label}
                      description={f.description}
                      disabled={!canEdit}
                    />
                  ))}
                </fieldset>
                <fieldset className="flex flex-col gap-3" disabled={!canEdit}>
                  <legend className="mb-2 text-sm font-semibold">Maintenance</legend>
                  <FormFieldSwitch
                    control={form.control}
                    name="maintenanceEnabled"
                    label="Show the maintenance screen"
                    description="Everyone sees it instead of the app until it is turned off and published again."
                    disabled={!canEdit}
                  />
                  <FormFieldTextarea
                    control={form.control}
                    name="maintenanceMessage"
                    label="Maintenance message"
                    rows={3}
                    maxLength={MAINTENANCE_MAX}
                    disabled={!canEdit}
                    description={`What people see on the maintenance screen, at most ${MAINTENANCE_MAX} characters.`}
                  />
                </fieldset>
                <fieldset className="grid gap-3 sm:grid-cols-2" disabled={!canEdit}>
                  <legend className="mb-2 text-sm font-semibold">Versions</legend>
                  <FormFieldText
                    control={form.control}
                    name="minVersion"
                    label="Minimum version"
                    placeholder="No limit"
                    description="Below it the app asks for an update before it opens."
                    disabled={!canEdit}
                  />
                  <FormFieldText
                    control={form.control}
                    name="recommendedVersion"
                    label="Recommended version"
                    placeholder="No limit"
                    description="Below it the app suggests an update."
                    disabled={!canEdit}
                  />
                </fieldset>
                <Can perm="config.edit">
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={!isDirty || save.isPending || conflict}>
                      <SaveIcon />
                      {save.isPending ? 'Saving…' : 'Save draft'}
                    </Button>
                    {isDirty && (
                      <Button type="button" variant="outline" onClick={() => form.reset()}>
                        Discard edits
                      </Button>
                    )}
                  </div>
                </Can>
              </form>
            </Form>
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Changes to publish</CardTitle>
            <CardDescription>The saved draft compared with published version {baseVersion}.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">The saved draft is the same as the published config.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm" aria-label="Changes to publish">
                {changes.map((c) => (
                  <li key={c.field} className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{c.label}</span>
                    <span className="text-muted-foreground line-through">{c.from}</span>
                    <ArrowRightIcon className="size-3.5 text-muted-foreground" aria-label="to" />
                    <span>{c.to}</span>
                  </li>
                ))}
              </ul>
            )}
            {isDirty && <p className="text-sm text-warning">Save the draft first: unsaved edits are not published.</p>}
            <Can perm="config.publish">
              <Button
                onClick={() => setPublishOpen(true)}
                disabled={changes.length === 0 || isDirty || publish.isPending || conflict}
                className="self-start"
              >
                <SendIcon />
                Publish to the app
              </Button>
            </Can>
          </CardContent>
        </Card>
      </div>
      <FormDialog<PublishValues>
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={`Publish version ${baseVersion + 1}?`}
        description="The app picks it up at its next start or when it comes back to the foreground (within about a minute)."
        schema={publishSchema}
        defaultValues={{ note: '' }}
        submitLabel="Publish"
        onSubmit={async (v) => {
          try {
            const p = await publish.mutateAsync({ baseVersion, note: v.note || undefined });
            toast.success(`Published version ${p.version}`);
          } catch (e) {
            onConflict(e);
            if (isConfigConflict(e)) return;
            throw e;
          }
        }}
      >
        {(f) => (
          <>
            <ul className="flex flex-col gap-1 text-sm">
              {changes.map((c) => (
                <li key={c.field}>
                  {c.label}: {c.from} to {c.to}
                </li>
              ))}
            </ul>
            <FormFieldTextarea control={f.control} name="note" label="Note (optional)" rows={2} maxLength={300} />
          </>
        )}
      </FormDialog>
    </>
  );
}

function HistoryCard({ current }: { current: AppConfigAdmin | undefined }) {
  const { page = 1 } = route.useSearch();
  const navigate = route.useNavigate();
  const versions = useConfigVersions(page);
  const rollback = useRollbackConfig();
  const [target, setTarget] = React.useState<ConfigVersion | null>(null);
  const [note, setNote] = React.useState('');
  const live = current?.published.version;
  const total = versions.data?.meta.totalPages ?? 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" aria-hidden />
          Published versions
        </CardTitle>
        <CardDescription>A rollback publishes an earlier version again as a new version.</CardDescription>
      </CardHeader>
      <CardContent>
        {versions.error ? (
          <ErrorState error={versions.error} onRetry={() => void versions.refetch()} />
        ) : !versions.data ? (
          <Skeleton className="h-32" />
        ) : (
          <>
            <Table aria-label="Published versions">
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.data.items.map((v) => (
                  <TableRow key={v.version}>
                    <TableCell className="font-medium">
                      v{v.version} {v.version === live && <StatusBadge status="live" label="Live" />}
                    </TableCell>
                    <TableCell>{formatDateTime(v.publishedAt)}</TableCell>
                    <TableCell>{v.publishedByName ?? v.publishedBy ?? 'System'}</TableCell>
                    <TableCell className="max-w-72 truncate text-muted-foreground">
                      {v.rolledBackFrom ? `Rollback to v${v.rolledBackFrom}. ` : ''}
                      {v.note ?? ''}
                    </TableCell>
                    <TableCell className="text-right">
                      {v.version !== live && current && (
                        <Can perm="config.rollback">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setNote('');
                              setTarget(v);
                            }}
                          >
                            <RotateCcwIcon />
                            Roll back
                          </Button>
                        </Can>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {total > 1 && (
              <div className="mt-3 flex items-center justify-end gap-2 text-sm">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() =>
                    void navigate({ search: (s) => cleanSearch({ ...s, page: page - 1 > 1 ? page - 1 : undefined }) })
                  }
                >
                  Newer
                </Button>
                <span>
                  Page {page} of {total}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= total}
                  onClick={() => void navigate({ search: (s) => ({ ...s, page: page + 1 }) })}
                >
                  Older
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
      {current && target && (
        <ConfirmDialog
          open={!!target}
          onOpenChange={(o) => !o && setTarget(null)}
          title={`Roll back to version ${target.version}?`}
          description={`Version ${target.version} is published again as version ${current.published.version + 1}. The app picks it up within about a minute.`}
          confirmLabel="Roll back"
          cancelLabel={`Keep version ${current.published.version}`}
          destructive
          onConfirm={async () => {
            try {
              const p = await rollback.mutateAsync({
                version: target.version,
                baseVersion: current.published.version,
                note: note.trim() || undefined,
              });
              toast.success(`Version ${target.version} is live again as version ${p.version}`);
            } catch (e) {
              toast.error(errorMessage(e));
              throw e;
            }
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Note (optional)</span>
            <Textarea value={note} maxLength={300} rows={2} onChange={(e) => setNote(e.target.value)} />
          </label>
        </ConfirmDialog>
      )}
    </Card>
  );
}
