import { zodResolver } from '@hookform/resolvers/zod';
import { PlayIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { FormFieldSelect, FormFieldSwitch, FormFieldTextarea, StatusBadge } from '@/components/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { errorMessage } from '@/lib/api';
import { useAiTest } from '../api/queries';
import type { AiSettingsInput } from '../api/types';
import { testSchema, TEST_TEXT_MAX } from '../schemas/ai';
import { MODE_LABEL } from '../lib/labels';

/** Try a message against the current settings, or the unsaved ones. Nothing is stored. */
export function TestConsole({
  modes,
  getDraft,
  dirty,
}: {
  modes: string[];
  getDraft: () => AiSettingsInput | null;
  dirty: boolean;
}) {
  const test = useAiTest();
  const form = useForm({
    resolver: zodResolver(testSchema),
    defaultValues: { mode: modes[0] ?? 'vent', text: '', useDraft: false },
  });
  const submit = form.handleSubmit(async ({ mode, text, useDraft }) => {
    const draft = useDraft ? getDraft() : null;
    await test.mutateAsync({ mode, text, ...(draft ? { draft } : {}) }).catch(() => undefined);
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
            <FormFieldSwitch
              control={form.control}
              name="useDraft"
              label="Use unsaved changes"
              description={
                dirty ? 'Try the settings on this page before saving them.' : 'No unsaved changes right now.'
              }
            />
            <Button type="submit" className="self-start" disabled={test.isPending}>
              <PlayIcon />
              {test.isPending ? 'Running…' : 'Run'}
            </Button>
          </form>
        </Form>
        {test.error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{errorMessage(test.error)}</AlertDescription>
          </Alert>
        )}
        {r && (
          <div className="mt-4 flex flex-col gap-2 rounded-lg border p-3" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge status={r.source} />
              <span className="text-muted-foreground">
                {r.provider}
                {r.model ? ` · ${r.model}` : ''} · {r.latencyMs} ms
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{r.reply}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
