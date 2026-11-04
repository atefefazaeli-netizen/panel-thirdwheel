import { getRouteApi, Link } from '@tanstack/react-router';
import { BookOpenCheckIcon, CheckCircle2Icon, ExternalLinkIcon, MessageSquareWarningIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { EmptyState, ErrorState, FormDialog, FormFieldTextarea, PageHeader, RoleGate } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useRoles } from '@/stores/session';
import { useApproveContent, useContentItem, useContentList, useRequestChanges } from '../api/queries';
import type { ContentItem } from '../api/types';
import { ApproveDialog } from '../components/approve-dialog';
import { ConflictBanner } from '../components/conflict-banner';
import { DiffView } from '../components/diff-view';
import { HeldBadge, HeldBanner, NeedsReviewBadge, ProvenancePanel } from '../components/review-status';
import { isConflict } from '../lib/review';
import { KIND_LABEL } from '../lib/labels';

const route = getRouteApi('/_app/review');
const requiredNote = z.object({ note: z.string().trim().min(1, 'Say what needs to change.').max(2000) });

export function ReviewQueuePage() {
  const { id } = route.useSearch();
  const navigate = route.useNavigate();
  const queue = useContentList({ state: 'in_review', limit: 100 });
  const items = queue.data?.items ?? [];
  const selected = id ?? items[0]?.id;

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Drafts waiting for a clinician. Compare the draft with what is live, then approve it or send it back with a note."
      />
      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm">
              In review <Badge variant="secondary">{queue.data?.meta.total ?? '…'}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {queue.error ? (
              <ErrorState error={queue.error} onRetry={() => void queue.refetch()} className="border-0" />
            ) : queue.isPending ? (
              <div className="flex flex-col gap-2 p-3">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={BookOpenCheckIcon}
                title="Nothing to review"
                description="Drafts appear here when an admin submits them."
                className="border-0"
              />
            ) : (
              <ul className="flex flex-col" aria-label="Drafts in review">
                {items.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => void navigate({ search: { id: i.id }, replace: true })}
                      aria-current={i.id === selected ? 'true' : undefined}
                      className={cn(
                        'flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        i.id === selected && 'bg-muted shadow-[inset_3px_0_0_var(--brand)]',
                      )}
                    >
                      <span className="truncate text-sm font-medium">{i.title}</span>
                      <span className="text-xs text-muted-foreground">
                        <span className="font-mono">{i.code ?? 'New'}</span> · {KIND_LABEL[i.kind] ?? i.kind} ·{' '}
                        {formatRelative(i.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {selected ? <ReviewDetail key={selected} id={selected} /> : !queue.isPending && null}
      </div>
    </>
  );
}

function ReviewDetail({ id }: { id: string }) {
  const item = useContentItem(id);
  if (item.error) return <ErrorState error={item.error} onRetry={() => void item.refetch()} />;
  if (!item.data) return <Skeleton className="h-96" />;
  return <ReviewPane id={id} first={item.data} />;
}

function ReviewPane({ id, first }: { id: string; first: ContentItem }) {
  const item = useContentItem(id);
  const approve = useApproveContent(id);
  const changes = useRequestChanges(id);
  const { user } = useRoles();
  const [dialog, setDialog] = React.useState<null | 'approve' | 'changes'>(null);
  // The copy the clinician is reading. A newer server copy never replaces it silently: approve and
  // request changes carry its revision, and a change shows the conflict banner instead.
  const [pinned, setPinned] = React.useState<ContentItem>(first);
  const [conflict, setConflict] = React.useState(false);
  const moved = conflict || (!!item.data && item.data.rev !== pinned.rev);
  const d = pinned.draft;
  const inReview = d?.state === 'in_review';

  const act = async (fn: () => Promise<ContentItem>, done: string) => {
    try {
      setPinned(await fn());
      toast.success(done);
    } catch (e) {
      if (isConflict(e)) {
        setConflict(true);
        return;
      }
      toast.error(errorMessage(e));
      throw e;
    }
  };
  const reload = async () => {
    const r = await item.refetch();
    if (r.data) setPinned(r.data);
    setConflict(false);
  };

  return (
    <Card className="min-w-0 gap-4">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate text-lg">{(d?.snapshot.catalog.title as string) ?? pinned.id}</CardTitle>
          <CardDescription>
            <span className="font-mono">{pinned.code ?? 'New'}</span> · {KIND_LABEL[pinned.kind] ?? pinned.kind}
            {d && (
              <>
                {' '}
                · submitted by {d.byEmail ?? d.by} {formatRelative(d.at)}
                {d.source === 'n8n' && ' via n8n'}
              </>
            )}
          </CardDescription>
          <div className="flex flex-wrap gap-1">
            {pinned.needsReview && <NeedsReviewBadge />}
            {pinned.heldMatch && <HeldBadge />}
          </div>
          {d?.note && <p className="text-sm">“{d.note}”</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/content/$id" params={{ id }}>
              <ExternalLinkIcon />
              Open in editor
            </Link>
          </Button>
          {inReview && (
            <RoleGate allow="clinician" mode="disable">
              <Button variant="outline" size="sm" disabled={moved} onClick={() => setDialog('changes')}>
                <MessageSquareWarningIcon />
                Request changes
              </Button>
            </RoleGate>
          )}
          {inReview && (
            <RoleGate allow="clinician" mode="disable">
              <Button
                size="sm"
                disabled={moved}
                className="bg-success text-success-foreground hover:bg-success/90"
                onClick={() => setDialog('approve')}
              >
                <CheckCircle2Icon />
                Approve and publish
              </Button>
            </RoleGate>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {moved && <ConflictBanner localJson={null} onReload={() => void reload()} />}
        {pinned.heldMatch && <HeldBanner match={pinned.heldMatch} />}
        {pinned.needsReview && <ProvenancePanel item={pinned} />}
        {!inReview ? (
          <EmptyState title="Not in review any more" description="Someone already acted on this draft." />
        ) : (
          <DiffView
            before={pinned.live}
            after={d!.snapshot}
            beforeLabel={pinned.live ? `Live v${pinned.liveVersion}` : 'Live'}
            afterLabel="Draft"
          />
        )}
      </CardContent>
      <ApproveDialog
        item={pinned}
        userId={user?.userId}
        open={dialog === 'approve'}
        onOpenChange={(o) => !o && setDialog(null)}
        onApprove={(v) => act(() => approve.mutateAsync({ rev: pinned.rev, ...v }), 'Approved and published')}
      />
      <FormDialog
        open={dialog === 'changes'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Request changes"
        description="The draft goes back to the admin with your note."
        schema={requiredNote}
        defaultValues={{ note: '' }}
        submitLabel="Send back"
        onSubmit={(v) => act(() => changes.mutateAsync({ rev: pinned.rev, note: v.note }), 'Sent back with your note')}
      >
        {(f) => (
          <FormFieldTextarea control={f.control} name="note" label="What needs to change" rows={4} maxLength={2000} />
        )}
      </FormDialog>
    </Card>
  );
}
