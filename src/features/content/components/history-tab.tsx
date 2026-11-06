import { EyeIcon, HistoryIcon, RotateCcwIcon } from 'lucide-react';
import * as React from 'react';
import { z } from 'zod';
import {
  DrawerPreview,
  EmptyState,
  ErrorState,
  FormDialog,
  FormFieldTextarea,
  Can,
  StatusBadge,
} from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useContentChanges, useContentVersion, useContentVersions } from '../api/queries';
import { partLabel, SEEDED_LABEL } from '../lib/review';
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

const who = (id: string, email: string | null, name?: string | null) =>
  id === 'workbook' ? 'Release 1 bundle (seed)' : (name ?? email ?? id);
const rollbackSchema = z.object({ note: z.string().trim().max(2000) });

export function HistoryTab({
  item,
  dirty = false,
  onRollback,
}: {
  item: ContentItem;
  /** Unsaved edits on the page: rolling back would replace what they are based on. */
  dirty?: boolean;
  /** Rolls back with the page's revision (409 handling lives on the page). */
  onRollback: (version: number, note?: string) => Promise<unknown>;
}) {
  const versions = useContentVersions(item.id);
  const [page, setPage] = React.useState(1);
  const changes = useContentChanges(item.id, page);
  const [viewing, setViewing] = React.useState<number | null>(null);
  const [rollback, setRollback] = React.useState<ContentVersion | null>(null);
  const version = useContentVersion(item.id, viewing);

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
                      {v.action === 'rolled_back' && (v.byName ?? v.byEmail) && (
                        <span className="block text-xs text-muted-foreground">by {v.byName ?? v.byEmail}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {who(v.approvedBy, v.approvedByEmail, v.approvedByName)}
                      {v.seeded && (
                        <span className="block text-xs text-muted-foreground">{v.approvalLabel ?? SEEDED_LABEL}</span>
                      )}
                    </TableCell>
                    <TableCell title={formatDateTime(v.publishedAt)}>{formatRelative(v.publishedAt)}</TableCell>
                    <TableCell className="max-w-64 truncate whitespace-normal">{v.note}</TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setViewing(v.version)}>
                          <EyeIcon />
                          View
                        </Button>
                        {v.version !== item.liveVersion && (
                          <Can perm="content.unpublish">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={dirty}
                              title={dirty ? 'Save or discard your edits first' : undefined}
                              onClick={() => setRollback(v)}
                            >
                              <RotateCcwIcon />
                              Roll back
                            </Button>
                          </Can>
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
                      {who(c.by, c.byEmail, c.byName)} · <time dateTime={c.at}>{formatRelative(c.at)}</time>
                    </span>
                  </div>
                  {(c.meta?.selfApproved ||
                    c.meta?.acknowledgedHeld ||
                    c.meta?.clearedReview ||
                    c.meta?.restoredReview) && (
                    <div className="flex flex-wrap gap-1">
                      {c.meta.selfApproved && <StatusBadge status="self" tone="warning" label="Self-approved" />}
                      {c.meta.acknowledgedHeld && (
                        <StatusBadge status="held" tone="danger" label="Held content acknowledged" />
                      )}
                      {c.meta.clearedReview && (
                        <StatusBadge
                          status="cleared"
                          tone="success"
                          label={`Cleared review: ${c.meta.clearedReview.map(partLabel).join(', ')}`}
                        />
                      )}
                      {c.meta.restoredReview && (
                        <StatusBadge
                          status="restored"
                          tone="warning"
                          label={`Needs review again: ${c.meta.restoredReview.map(partLabel).join(', ')}`}
                        />
                      )}
                    </div>
                  )}
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
        description={`That snapshot goes live again as version ${item.liveVersion + 1}, keeping its original approver${rollback?.seeded ? ' (the seed: its clinical review flags come back)' : ''}. You are recorded as the one who rolled back. The draft, if any, stays as it is.`}
        schema={rollbackSchema}
        defaultValues={{ note: '' }}
        submitLabel="Roll back"
        onSubmit={(v) => onRollback(rollback!.version, v.note || undefined)}
      >
        {(f) => <FormFieldTextarea control={f.control} name="note" label="Why (optional)" rows={3} maxLength={2000} />}
      </FormDialog>
    </div>
  );
}
