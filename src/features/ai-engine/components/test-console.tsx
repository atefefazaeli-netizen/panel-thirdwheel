import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { LockKeyholeIcon, PlayIcon } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { FormFieldSelect, FormFieldSwitch, FormFieldText, FormFieldTextarea, StatusBadge } from '@/components/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { useContentList } from '@/features/content/api/queries';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/stores/session';
import { useAiTest } from '../api/queries';
import type { AiSettingsInput, AiTestResult } from '../api/types';
import { testSchema, TEST_TEXT_MAX } from '../schemas/ai';
import { MODE_LABEL } from '../lib/labels';

/** What each answer source means, so nobody mistakes built-in copy for a model reply. */
const SOURCE_COPY: Record<AiTestResult['source'], { label: string; help: string }> = {
  ai: { label: 'Real model reply', help: 'The model answered and the reply passed the safety check.' },
  fallback: {
    label: 'Fallback copy, not the model',
    help: 'No model reply was used: AI is off for these settings (fallback only, provider none or no API key), or the model failed or answered in the wrong shape. The app would show this built-in copy.',
  },
  risk: {
    label: 'Safety reply (risk check)',
    help: 'The crisis check matched your message or the model reply, so the app shows its safety copy and never the model.',
  },
};

/** Suggestions for the content picker (needs content.read; otherwise the id is typed by hand). */
function ContentSuggestions({ id, q }: { id: string; q: string }) {
  const list = useContentList({ q: q || undefined, state: 'live', limit: 20 });
  return (
    <datalist id={id}>
      {list.data?.items.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title ?? c.id}
        </option>
      ))}
    </datalist>
  );
}

/**
 * Try a message against the current settings, or the unsaved ones (STAFF_API.md §7). The console
 * never reads app-user data; the only optional context is one item's published content. Nothing is
 * stored.
 */
export function TestConsole({
  modes,
  getDraft,
  dirty,
  canUseDraft = true,
}: {
  modes: string[];
  getDraft: () => AiSettingsInput | null;
  dirty: boolean;
  /** False when the page has no settings form (ai.test without ai.read). */
  canUseDraft?: boolean;
}) {
  const test = useAiTest();
  const canSearchContent = useCan('content.read');
  const listId = React.useId();
  const form = useForm({
    resolver: zodResolver(testSchema),
    defaultValues: { mode: modes[0] ?? 'vent', text: '', useDraft: false, useContent: false, contentId: '' },
  });
  const useContent = useWatch({ control: form.control, name: 'useContent' });
  const contentId = useWatch({ control: form.control, name: 'contentId' }) ?? '';
  const [draftError, setDraftError] = React.useState(false);
  const submit = form.handleSubmit(async ({ mode, text, useDraft, useContent: withContent, contentId: cid }) => {
    const draft = useDraft ? getDraft() : null;
    // Never fall back to the saved settings silently when the unsaved ones were asked for.
    setDraftError(useDraft && !draft);
    if (useDraft && !draft) return;
    await test
      .mutateAsync({ mode, text, ...(draft ? { draft } : {}), ...(withContent && cid ? { contentId: cid } : {}) })
      .catch(() => undefined);
  });
  const r = test.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Test console</CardTitle>
        <CardDescription>
          Runs the safety check first, then the model. Nothing is stored. Limited to 10 a minute.
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-0">
        <Alert className="mb-4">
          <LockKeyholeIcon />
          <AlertDescription>
            The console has no access to user data: no profiles, chats or safety data. Write test messages yourself, and
            never paste anything a real person wrote. Runs are audited without the text.
          </AlertDescription>
        </Alert>
      </CardContent>
      <CardContent>
        <Form {...form}>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <FormFieldSelect
              control={form.control}
              name="mode"
              label="Mode"
              options={[
                ...modes.map((m) => ({ value: m, label: MODE_LABEL[m] ?? m })),
                { value: 'quiz', label: 'Quiz result writer' },
              ]}
            />
            <FormFieldTextarea control={form.control} name="text" label="Message" rows={3} maxLength={TEST_TEXT_MAX} />
            {canUseDraft && (
              <FormFieldSwitch
                control={form.control}
                name="useDraft"
                label="Use unsaved changes"
                description={
                  dirty ? 'Try the settings on this page before saving them.' : 'No unsaved changes right now.'
                }
              />
            )}
            <FormFieldSwitch
              control={form.control}
              name="useContent"
              label="Use published content as context"
              description="Adds one item's published version (read only) to the test prompt. Drafts are never used."
            />
            {useContent && (
              <div className="flex flex-col gap-1">
                <FormFieldText
                  control={form.control}
                  name="contentId"
                  label="Content id"
                  placeholder="my-perfect-day"
                  autoComplete="off"
                  listId={canSearchContent ? listId : undefined}
                />
                {canSearchContent && <ContentSuggestions id={listId} q={contentId} />}
              </div>
            )}
            <Button type="submit" className="self-start" disabled={test.isPending}>
              <PlayIcon />
              {test.isPending ? 'Running…' : 'Run'}
            </Button>
          </form>
        </Form>
        {draftError && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>
              The unsaved settings have errors. Fix them on the page, or turn off Use unsaved changes.
            </AlertDescription>
          </Alert>
        )}
        {test.error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{errorMessage(test.error)}</AlertDescription>
          </Alert>
        )}
        {r && (
          <div className="mt-4 flex flex-col gap-2 rounded-lg border p-3" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge status={r.source} label={SOURCE_COPY[r.source]?.label} />
              <span className="text-muted-foreground">
                {r.provider}
                {r.model ? ` · ${r.model}` : ''} · {r.latencyMs} ms
              </span>
            </div>
            {SOURCE_COPY[r.source] && <p className="text-xs text-muted-foreground">{SOURCE_COPY[r.source].help}</p>}
            <p className="text-sm whitespace-pre-wrap">{r.reply}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
