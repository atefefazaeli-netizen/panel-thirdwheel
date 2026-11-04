import { EyeIcon, RotateCcwIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, DrawerPreview, ErrorState, RoleGate } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useAiHistory, useRollbackAiSettings } from '../api/queries';
import type { AiSettingsHistoryEntry } from '../api/types';

export function HistoryCard({ currentVersion }: { currentVersion: number }) {
  const [page, setPage] = React.useState(1);
  const history = useAiHistory(page);
  const rollback = useRollbackAiSettings();
  const [viewing, setViewing] = React.useState<AiSettingsHistoryEntry | null>(null);
  const [target, setTarget] = React.useState<AiSettingsHistoryEntry | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>
          Every save is a version. Rolling back saves an earlier version again as a new one.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {history.error ? (
          <ErrorState error={history.error} onRetry={() => void history.refetch()} className="mx-6" />
        ) : (
          <Table aria-label="AI settings versions">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Version</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>By</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="pr-6">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(history.data?.items ?? []).map((h) => (
                <TableRow key={h.version}>
                  <TableCell className="pl-6 font-medium tabular-nums">
                    v{h.version}
                    {h.version === currentVersion && (
                      <Badge variant="outline" className="ml-2 border-transparent bg-success-soft text-success">
                        Current
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {h.settings.provider}
                    {h.settings.fallbackOnly && <span className="text-muted-foreground"> · fallback only</span>}
                  </TableCell>
                  <TableCell className="max-w-72 truncate whitespace-normal">{h.note}</TableCell>
                  <TableCell>{h.updatedByEmail ?? h.updatedBy ?? 'Environment'}</TableCell>
                  <TableCell title={formatDateTime(h.updatedAt)}>{formatRelative(h.updatedAt)}</TableCell>
                  <TableCell className="pr-6">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setViewing(h)}>
                        <EyeIcon />
                        View
                      </Button>
                      {h.version !== currentVersion && (
                        <RoleGate allow="admin">
                          <Button variant="outline" size="sm" onClick={() => setTarget(h)}>
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
        {history.data && history.data.meta.totalPages > 1 && (
          <div className="mt-3 flex items-center justify-end gap-2 px-6 text-sm">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Newer
            </Button>
            <span className="tabular-nums">
              {page} / {history.data.meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= history.data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Older
            </Button>
          </div>
        )}
      </CardContent>
      <DrawerPreview
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        title={`Version ${viewing?.version ?? ''}`}
        description={viewing?.note ?? undefined}
      >
        <pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
          {JSON.stringify(viewing?.settings, null, 2)}
        </pre>
      </DrawerPreview>
      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Roll back to version ${target?.version}?`}
        description="Its settings are saved again as a new version. If that version's provider has lost its API key, the server refuses."
        confirmLabel="Roll back"
        cancelLabel="Keep current"
        onConfirm={async () => {
          // baseVersion: refused with SETTINGS_CONFLICT when someone saved since this page loaded.
          await rollback.mutateAsync({ version: target!.version, baseVersion: currentVersion });
          toast.success(`Rolled back to version ${target!.version}`);
        }}
      />
    </Card>
  );
}
