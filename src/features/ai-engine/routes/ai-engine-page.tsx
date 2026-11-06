import { zodResolver } from '@hookform/resolvers/zod';
import { InfoIcon, RefreshCwIcon, SaveIcon, TriangleAlertIcon, Undo2Icon } from 'lucide-react';
import * as React from 'react';
import { useForm, useFormState } from 'react-hook-form';
import { toast } from 'sonner';
import { Can, ErrorState, FormFieldText, PageHeader } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCan } from '@/stores/session';
import { isSettingsConflict, useAiHistory, useAiSettings, useSaveAiSettings } from '../api/queries';
import type { AiSettingsView } from '../api/types';
import { HistoryCard } from '../components/history-card';
import { PromptsCard } from '../components/prompts-card';
import { ModelCards, ProviderCard } from '../components/settings-cards';
import { TestConsole } from '../components/test-console';
import { MODE_LABEL } from '../lib/labels';
import { aiSettingsSchema, toForm, toInput, type AiSettingsForm } from '../schemas/ai';

export function AiEnginePage() {
  // Settings need ai.read; an account with only ai.test gets the console alone.
  const canRead = useCan('ai.read');
  return canRead ? <SettingsPage /> : <ConsoleOnly />;
}

function ConsoleOnly() {
  return (
    <>
      <PageHeader
        title="AI engine"
        description="Try messages against the live AI settings. Your role can't read or change them."
      />
      <div className="max-w-xl">
        <TestConsole modes={Object.keys(MODE_LABEL)} dirty={false} canUseDraft={false} getDraft={() => null} />
      </div>
    </>
  );
}

function SettingsPage() {
  const q = useAiSettings();
  if (q.error)
    return <ErrorState error={q.error} title="Could not load the AI settings" onRetry={() => void q.refetch()} />;
  if (!q.data)
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    );
  return <Settings key={q.data.current.version} view={q.data} onReload={() => void q.refetch()} />;
}

function Settings({ view, onReload }: { view: AiSettingsView; onReload: () => void }) {
  const readOnly = !useCan('ai.edit');
  const schema = React.useMemo(() => aiSettingsSchema(view.keys), [view.keys]);
  const form = useForm<AiSettingsForm>({
    resolver: zodResolver(schema),
    defaultValues: toForm(view.current, view.modes),
    mode: 'onChange',
  });
  const { isDirty } = useFormState({ control: form.control });
  const save = useSaveAiSettings();
  const c = view.current;
  const latest = useAiHistory(1).data?.items.find((h) => h.version === c.version);
  const by = latest?.updatedByName ?? latest?.updatedByEmail ?? c.updatedBy;
  // Someone else saved while this form was open: the server refused ours (409 SETTINGS_CONFLICT).
  const [conflict, setConflict] = React.useState(false);

  const onSave = form.handleSubmit(async (v) => {
    try {
      // baseVersion: the version this form was loaded from, so a newer save is never overwritten.
      const saved = await save.mutateAsync({
        ...toInput(v),
        ...(v.note ? { note: v.note } : {}),
        baseVersion: c.version,
      });
      toast.success(`Saved as version ${(saved as { version: number }).version}`);
    } catch (e) {
      if (isSettingsConflict(e)) setConflict(true);
      toast.error(errorMessage(e));
    }
  });

  return (
    <Form {...form}>
      <PageHeader
        title="AI engine"
        meta={<Badge variant="secondary">{c.version === 0 ? 'Environment defaults' : `Version ${c.version}`}</Badge>}
        description={
          c.version === 0
            ? 'Nothing saved yet: the API runs on its environment settings.'
            : `Saved ${formatRelative(c.updatedAt)}${by ? ` by ${by}` : ''}. Changes apply without a redeploy.`
        }
      />
      {conflict && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Someone else saved the AI settings</AlertTitle>
          <AlertDescription>
            <p>
              Your changes were not saved, so theirs are not overwritten. They are still in the form: copy anything you
              want to keep, then reload to see the newest version and make your change again.
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onReload}>
              <RefreshCwIcon />
              Reload the newest version
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {readOnly && (
        <Alert>
          <InfoIcon />
          <AlertTitle>Read only</AlertTitle>
          <AlertDescription>
            Your role can read the AI settings and prompts. Changing them needs the AI edit permission.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <form onSubmit={onSave} noValidate className="flex min-w-0 flex-col gap-4">
            <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-4">
              <ProviderCard view={view} readOnly={readOnly} />
              <ModelCards view={view} readOnly={readOnly} />
              <PromptsCard view={view} readOnly={readOnly} />
            </fieldset>
            <Can perm="ai.edit">
              <Card
                className={cn(
                  'py-3',
                  isDirty &&
                    'sticky bottom-3 z-10 bg-card/95 shadow-md backdrop-blur supports-[backdrop-filter]:bg-card/85',
                )}
              >
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <FormFieldText
                    control={form.control}
                    name="note"
                    label="Change note"
                    maxLength={300}
                    placeholder="What changed and why"
                    className="flex-1"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!isDirty || save.isPending}
                      onClick={() => form.reset(toForm(view.current, view.modes))}
                    >
                      <Undo2Icon />
                      Discard
                    </Button>
                    <Button type="submit" disabled={!isDirty || save.isPending}>
                      <SaveIcon />
                      {save.isPending ? 'Saving…' : 'Save as new version'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Can>
          </form>
          <HistoryCard currentVersion={c.version} />
        </div>
        <div className="flex flex-col gap-4 xl:sticky xl:top-20">
          <Can perm="ai.test">
            <TestConsole
              modes={view.modes}
              dirty={isDirty}
              getDraft={() => {
                const parsed = schema.safeParse(form.getValues());
                return parsed.success ? toInput(parsed.data) : null;
              }}
            />
          </Can>
        </div>
      </div>
    </Form>
  );
}
