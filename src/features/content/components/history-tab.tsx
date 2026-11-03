import { EyeIcon, HistoryIcon, RotateCcwIcon } from 'lucide-react';
import * as React from 'react';
import { z } from 'zod';
import {
  DrawerPreview,
  EmptyState,
  ErrorState,
  FormDialog,
  FormFieldTextarea,
  RoleGate,
  StatusBadge,
} from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useContentChanges, useContentVersion, useContentVersions, useRollbackContent } from '../api/queries';
import type { ContentItem, ContentVersion } from '../api/types';
import { SnapshotView } from './snapshot-view';

const ACTION_LABEL: Record<string, string> = {
  seeded: 'Seeded',
  published: 'Published',
  rolled_back: 'Rolled back',
  created: 'Created',
  draft_saved: 'Draft saved',
  draft_discarded: 'Draft discarded',
  submitted: 'Submitted',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  unpublished: 'Unpublished',
  restored: 'Restored',
  imported: 'Imported',
};

const who = (id: string, email: string | null) => (id === 'workbook' ? 'Workbook (clinician-cleared)' : (email ?? id));
const rollbackSchema = z.object({ note: z.string().trim().max(2000) });

export function HistoryTab({ item }: { item: ContentItem }) {
  const versions = useContentVersions(item.id);
  const [page, setPage] = React.useState(1);
  const changes = useContentChanges(item.id, page);
  const [viewing, setViewing] = React.useState<number | null>(null);
  const [rollback, setRollback] = React.useState<ContentVersion | null>(null);
  const version = useContentVersion(item.id, viewing);
  const doRollback = useRollbackContent(item.id);

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-3">
        <CardHeader>
          <CardTitle>Versions</CardTitle>
          <CardDescription>
            Every approved snapshot. Rolling back makes an earlier one live again as a new version.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {versions.error ? (
            <ErrorState error={versions.error} onRetry={() => void versions.refetch()} className="mx-6" />
          ) : versions.isPending ? (
            <div className="flex flex-col gap-2 px-6">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : versions.data.length === 0 ? (
            <EmptyState
              icon={HistoryIcon}
              title="Not published yet"
              description="Versions appear once a clinician approves a draft."
              className="mx-6"
            />
          ) : (
            <Table aria-label="Versions">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Version</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Approved by</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="pr-6 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.data.map((v) => (
                  <TableRow key={v.version}>
                    <TableCell className="pl-6 font-medium tabular-nums">
                      v{v.version}
                      {v.version === item.liveVersion && (
                        <Badge className="ml-2 border-transparent bg-success-soft text-success" variant="outline">
                          Live
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {ACTION_LABEL[v.action] ?? v.action}
                      {v.from != null && <span className="text-muted-foreground"> from v{v.from}</span>}
                      {v.action === 'rolled_back' && v.byEmail && (
                        <span className="block text-xs text-muted-foreground">by {v.byEmail}</span>
                      )}
                    </TableCell>
                    <TableCell>{who(v.approvedBy, v.approvedByEmail)}</TableCell>
                    <TableCell title={formatDateTime(v.publishedAt)}>{formatRelative(v.publishedAt)}</TableCell>
                    <TableCell className="max-w-64 truncate whitespace-normal">{v.note}</TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setViewing(v.version)}>
                          <EyeIcon />
                          View
                        </Button>
                        {v.version !== item.liveVersion && (
                          <RoleGate allow="admin">
                            <Button variant="outline" size="sm" onClick={() => setRollback(v)}>
                              <RotateCcwIcon />
                              Roll back
                            </Button>
                          </RoleGate>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle>Change log</CardTitle>
          <CardDescription>Who did what. Summaries name fields, never the text.</CardDescription>
        </CardHeader>
        <CardContent>
          {changes.error ? (
            <ErrorState error={changes.error} onRetry={() => void changes.refetch()} />
          ) : (
            <ol className="flex flex-col gap-3" aria-busy={changes.isFetching}>
              {(changes.data?.items ?? []).map((c, i) => (
                <li key={`${c.at}-${i}`} className="flex flex-col gap-1 border-l-2 pl-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{ACTION_LABEL[c.action] ?? c.action}</span>
                    {c.meta?.version != null && <Badge variant="secondary">v{c.meta.version}</Badge>}
                    {c.meta?.state && <StatusBadge status={c.meta.state} />}
                    <span className="text-muted-foreground">
                      {who(c.by, c.byEmail)} · <time dateTime={c.at}>{formatRelative(c.at)}</time>
                    </span>
                  </div>
                  {c.note && <p className="text-sm">“{c.note}”</p>}
                  {c.meta?.summary && c.meta.summary.length > 0 && (
                    <p className="font-mono text-xs text-muted-foreground">{c.meta.summary.join(' · ')}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
          {changes.data && changes.data.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-2 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Newer
              </Button>
              <span className="tabular-nums">
                {page} / {changes.data.meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= changes.data.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Older
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <DrawerPreview
        open={viewing != null}
        onOpenChange={(o) => !o && setViewing(null)}
        title={`Version ${viewing ?? ''}`}
        description={
          version.data ? `${ACTION_LABEL[version.data.action]} ${formatDateTime(version.data.publishedAt)}` : undefined
        }
        size="xl"
      >
        {version.isPending ? (
          <Skeleton className="h-64" />
        ) : version.error ? (
          <ErrorState error={version.error} />
        ) : (
          version.data && <SnapshotView snapshot={version.data.snapshot} />
        )}
      </DrawerPreview>

      <FormDialog
        open={!!rollback}
        onOpenChange={(o) => !o && setRollback(null)}
        title={`Roll back to version ${rollback?.version}?`}
        description={`That approved snapshot goes live again as version ${item.liveVersion + 1}. The draft, if any, stays as it is.`}
        schema={rollbackSchema}
        defaultValues={{ note: '' }}
        submitLabel="Roll back"
        onSubmit={(v) => doRollback.mutateAsync({ version: rollback!.version, note: v.note || undefined })}
      >
        {(f) => <FormFieldTextarea control={f.control} name="note" label="Why (optional)" rows={3} maxLength={2000} />}
      </FormDialog>
    </div>
  );
}
