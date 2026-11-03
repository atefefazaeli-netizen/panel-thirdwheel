import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2Icon, FileUpIcon, UploadIcon, XCircleIcon } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ForbiddenState, FormFieldTextarea, JsonEditor, PageHeader, RoleGate, StatusBadge } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { parseJson } from '@/lib/json';
import { useImportContent } from '../api/queries';
import type { ContentImportResult } from '../api/types';
import { KIND_LABEL } from '../lib/labels';
import { parseImport, type ImportRow } from '../schemas/import';

const EXAMPLE = JSON.stringify(
  [
    {
      id: 'my-perfect-day',
      code: 'Q-2-01',
      pillar: 'quiz',
      kind: 'type-quiz',
      catalog: {
        title: 'My perfect day',
        meta: 'Under 5 min · Two phones',
        where: ['anywhere', 'home'],
        category: 'know-me',
        minutes: 5,
      },
      body: {
        deck: { type: 'V-TX', questions: [{ q: 'What would make a perfect day for you?' }] },
        howYouPlay: 'Two phones',
      },
    },
  ],
  null,
  2,
);

const noteSchema = z.object({ note: z.string().trim().max(500) });

export function ContentImportPage() {
  return (
    <RoleGate allow="admin" fallback={<ForbiddenState what="content import" />}>
      <ImportScreen />
    </RoleGate>
  );
}

function ImportScreen() {
  const [text, setText] = React.useState('');
  const [result, setResult] = React.useState<ContentImportResult | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const run = useImportContent();
  const form = useForm<z.infer<typeof noteSchema>>({ resolver: zodResolver(noteSchema), defaultValues: { note: '' } });

  const parsed = React.useMemo(() => {
    if (!text.trim()) return null;
    const json = parseJson(text);
    return json.ok ? parseImport(json.value) : null;
  }, [text]);
  const rows: ImportRow[] = parsed?.ok ? parsed.rows : [];
  const valid = rows.filter((r) => r.item);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('That file is over 5 MB.');
      return;
    }
    setText(await file.text());
    setResult(null);
  };

  const submit = form.handleSubmit(async ({ note }) => {
    const r = await run.mutateAsync({ items: valid.map((v) => v.item!), note: note || undefined });
    setResult(r);
    toast.success(`Imported: ${r.created.length} new, ${r.updated.length} updated, ${r.rejected.length} rejected`);
  });

  return (
    <>
      <PageHeader
        title="Import content"
        description="Paste or upload a JSON list of items (the same shape n8n sends). Every item lands as a draft in review, never live."
      />
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1. JSON</CardTitle>
            <CardDescription>An array of items, or {'{ "items": [...] }'}. At most 200 items.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-label="Upload a JSON file"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <FileUpIcon />
                Upload file
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => (setText(EXAMPLE), setResult(null))}>
                Paste an example
              </Button>
            </div>
            <JsonEditor
              label="Items"
              value={text}
              onChange={(t) => (setText(t), setResult(null))}
              rows={18}
              validate={(v) => {
                const p = parseImport(v);
                return p.ok ? [] : [p.error];
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>2. Preview</CardTitle>
            <CardDescription>
              {rows.length
                ? `${valid.length} of ${rows.length} ready. Items with problems are left out.`
                : 'Valid items show here before you import.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {rows.length > 0 && (
              <div className="max-h-[420px] overflow-auto rounded-md border">
                <Table aria-label="Import preview">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Id</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Check</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.index}>
                        <TableCell className="font-mono text-xs">{r.id}</TableCell>
                        <TableCell className="max-w-48 truncate">{r.title}</TableCell>
                        <TableCell>{KIND_LABEL[r.kind] ?? r.kind}</TableCell>
                        <TableCell className="whitespace-normal">
                          {r.problems.length === 0 ? (
                            <span className="flex items-center gap-1 text-sm text-success">
                              <CheckCircle2Icon className="size-4" aria-hidden /> Ready
                            </span>
                          ) : (
                            <ul className="flex flex-col gap-0.5 text-xs text-destructive">
                              {r.problems.map((p) => (
                                <li key={p} className="flex gap-1">
                                  <XCircleIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
                                  {p}
                                </li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <Form {...form}>
              <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
                <FormFieldTextarea
                  control={form.control}
                  name="note"
                  label="Note for the clinician (optional)"
                  rows={2}
                  maxLength={500}
                />
                <Button type="submit" disabled={valid.length === 0 || run.isPending} className="self-start">
                  <UploadIcon />
                  {run.isPending ? 'Importing…' : `Import ${valid.length || ''} as drafts in review`}
                </Button>
              </form>
            </Form>
            {result && (
              <Alert>
                <CheckCircle2Icon />
                <AlertTitle>Import finished</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status="delivered" label={`${result.created.length} created`} />
                    <StatusBadge status="pending" label={`${result.updated.length} updated`} />
                    <StatusBadge status="failed" label={`${result.rejected.length} rejected`} />
                  </div>
                  {result.rejected.length > 0 && (
                    <ul className="mt-2 list-disc pl-4">
                      {result.rejected.map((r) => (
                        <li key={r.id}>
                          <span className="font-mono">{r.id || '(no id)'}</span>: {r.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
