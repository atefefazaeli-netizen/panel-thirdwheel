import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2Icon, FileUpIcon, SearchCheckIcon, ShieldAlertIcon, UploadIcon, XCircleIcon } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormFieldTextarea, JsonEditor, PageHeader, RequirePermission, StatusBadge } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { parseJson } from '@/lib/json';
import { useImportCheck, useImportContent } from '../api/queries';
import type { ContentImportItemResult, ContentImportResult } from '../api/types';
import { KIND_LABEL, STATE_LABEL } from '../lib/labels';
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
    <RequirePermission perm="content.edit" what="content import">
      <ImportScreen />
    </RequirePermission>
  );
}

function ImportScreen() {
  const [text, setText] = React.useState('');
  const [result, setResult] = React.useState<ContentImportResult | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const run = useImportContent();
  const check = useImportCheck();
  /** The server's dry run for the current text (validation, existing ids, held list); nothing written. */
  const [checked, setChecked] = React.useState<{ text: string; byIndex: ContentImportItemResult[] } | null>(null);
  const form = useForm<z.infer<typeof noteSchema>>({ resolver: zodResolver(noteSchema), defaultValues: { note: '' } });

  const parsed = React.useMemo(() => {
    if (!text.trim()) return null;
    const json = parseJson(text);
    return json.ok ? parseImport(json.value) : null;
  }, [text]);
  const rows: ImportRow[] = parsed?.ok ? parsed.rows : [];
  const valid = rows.filter((r) => r.item);
  const server = checked && checked.text === text ? checked.byIndex : null;

  const runCheck = async () => {
    try {
      const r = await check.mutateAsync(valid.map((v) => v.item!));
      setChecked({ text, byIndex: r.results });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

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
        description="Paste or upload a JSON list of items (the same shape n8n sends). Every item lands as a draft in review, never live. The Release 1 workbook is an .xlsx: convert it with scripts/release1-workbook.py first; the panel does not read spreadsheets."
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
                      <TableHead>Server</TableHead>
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
                        <TableCell className="whitespace-normal">
                          <ServerCell result={r.item && server ? server[valid.indexOf(r)] : undefined} />
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
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={valid.length === 0 || check.isPending}
                    onClick={() => void runCheck()}
                  >
                    <SearchCheckIcon />
                    {check.isPending ? 'Checking…' : 'Check against the server'}
                  </Button>
                  <Button type="submit" disabled={valid.length === 0 || run.isPending}>
                    <UploadIcon />
                    {run.isPending ? 'Importing…' : `Import ${valid.length || ''} as drafts in review`}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The check runs the import on the server without writing anything: it finds ids that already exist
                  (their draft would be replaced), items the server rejects, and matches with held content.
                </p>
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
                  <ul className="mt-2 flex flex-col gap-1" aria-label="Import results">
                    {result.results.map((r, i) => (
                      <li key={`${r.id}-${i}`} className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono">{r.id || '(no id)'}</span>
                        <ServerCell result={r} done />
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** One item's server outcome: new, replaces a draft, rejected (with the server's details), held. */
function ServerCell({ result, done }: { result: ContentImportItemResult | undefined; done?: boolean }) {
  if (!result) return <span className="text-xs text-muted-foreground">Not checked</span>;
  const held = result.held?.length ? (
    <span className="flex items-start gap-1 text-xs text-destructive">
      <ShieldAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
      Held content: {result.held.join('; ')}
    </span>
  ) : null;
  if (result.status === 'rejected')
    return (
      <span className="flex flex-col text-xs text-destructive">
        <span>Rejected: {result.reason}</span>
        {result.details?.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </span>
    );
  const what =
    result.status === 'created'
      ? done
        ? 'Created, in review'
        : 'New item'
      : `${done ? 'Updated' : 'Exists'}: ${
          result.replacedDraft
            ? `replaces its draft (${STATE_LABEL[result.replacedDraft]})`
            : 'becomes its draft in review'
        }`;
  return (
    <span className="flex flex-col gap-0.5">
      <span className={result.status === 'updated' ? 'text-xs text-warning' : 'text-xs text-success'}>{what}</span>
      {held}
    </span>
  );
}
