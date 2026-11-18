import { getRouteApi, Link } from '@tanstack/react-router';
import {
  AlertTriangleIcon,
  BookOpenCheckIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  MessageSquareWarningIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import * as React from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Can, EmptyState, ErrorState, FormDialog, FormFieldTextarea, PageHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useSession } from '@/stores/session';
import { useApproveContent, useContentItem, useContentItems, useContentList, useRequestChanges } from '../api/queries';
import type { ContentItem } from '../api/types';
import { ApproveDialog } from '../components/approve-dialog';
import { ConflictBanner } from '../components/conflict-banner';
import { DiffView } from '../components/diff-view';
import {
  DeckTooShortAlert,
  HeldBadge,
  HeldBanner,
  NeedsReviewBadge,
  ProvenancePanel,
} from '../components/review-status';
import {
  boardOfSnapshot,
  boardPreview,
  BOARD_LABEL,
  goLiveShortfall,
  PREVIEW_NAMES,
  sessionShortfalls,
  shortfallText,
} from '../lib/boards';
import { deckTooShortMessage, isConflict, sourceLabel } from '../lib/review';
import { REVIEW_SOURCES } from '../schemas/search';
import { KIND_LABEL } from '../lib/labels';

const route = getRouteApi('/_app/review');
const requiredNote = z.object({ note: z.string().trim().min(1, 'Say what needs to change.').max(2000) });

type QueueSource = (typeof REVIEW_SOURCES)[number];
const sourceOfItem = (i: ContentItem | undefined): QueueSource | null => (i ? (i.provenance?.source ?? 'panel') : null);

export function ReviewQueuePage() {
  const { id, source } = route.useSearch();
  const navigate = route.useNavigate();
  const queue = useContentList({ state: 'in_review', limit: 100 });
  const all = queue.data?.items ?? [];
  // List rows don't carry provenance: read each queued item (the same cache the detail uses), so
  // the source filter covers the whole queue, not only what one page shows.
  const details = useContentItems(all.map((i) => i.id));
  const detailOf = new Map(details.flatMap((q) => (q.data ? [[q.data.id, q.data] as const] : [])));
  const loadingSources = details.some((q) => q.isPending);
  const counts = new Map<QueueSource, number>();
  for (const i of all) {
    const src = sourceOfItem(detailOf.get(i.id));
    if (src) counts.set(src, (counts.get(src) ?? 0) + 1);
  }
  const items = source ? all.filter((i) => sourceOfItem(detailOf.get(i.id)) === source) : all;
  const selected = id && items.some((i) => i.id === id) ? id : items[0]?.id;

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Drafts waiting for a clinician. Compare the draft with what is live, then approve it or send it back with a note."
      />
      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-col gap-2 border-b py-3">
            <CardTitle className="text-sm">
              In review <Badge variant="secondary">{queue.data?.meta.total ?? '…'}</Badge>
            </CardTitle>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by source">
              {([undefined, ...REVIEW_SOURCES] as (QueueSource | undefined)[]).map((src) => {
                const n = src ? (counts.get(src) ?? 0) : all.length;
                if (src && !n && source !== src) return null;
                return (
                  <Button
                    key={src ?? 'all'}
                    type="button"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    variant={source === src ? 'default' : 'outline'}
                    aria-pressed={source === src}
                    onClick={() =>
                      void navigate({ search: (prev) => ({ ...prev, source: src, id: undefined }), replace: true })
                    }
                  >
                    {src ? sourceLabel(src === 'panel' ? null : src) : 'All'} {loadingSources && src ? '' : n}
                  </Button>
                );
              })}
            </div>
            {(queue.data?.meta.total ?? 0) > all.length && (
              <p className="text-xs text-muted-foreground">
                Showing the first {all.length} of {queue.data?.meta.total}. The source filter covers these.
              </p>
            )}
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
                description="Drafts appear here when an editor submits them."
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
                      <QueueFlags item={detailOf.get(i.id)} />
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
  const staff = useSession((s) => s.staff);
  const [dialog, setDialog] = React.useState<null | 'approve' | 'changes'>(null);
  // The copy the clinician is reading. A newer server copy never replaces it silently: approve and
  // request changes carry its revision, and a change shows the conflict banner instead.
  const [pinned, setPinned] = React.useState<ContentItem>(first);
  const [conflict, setConflict] = React.useState(false);
  // 409 DECK_TOO_SHORT: approve refused because the board has under 5 cards (app v2.5.0).
  const [tooShort, setTooShort] = React.useState<string | null>(null);
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
      const short = deckTooShortMessage(e);
      if (short) {
        setTooShort(short);
        setDialog(null);
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
                · submitted by {d.byName ?? d.byEmail ?? d.by} {formatRelative(d.at)}
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
            <Can perm="content.approve" mode="disable">
              <Button variant="outline" size="sm" disabled={moved} onClick={() => setDialog('changes')}>
                <MessageSquareWarningIcon />
                Request changes
              </Button>
            </Can>
          )}
          {inReview && (
            <Can perm="content.approve" mode="disable">
              <Button
                size="sm"
                disabled={moved}
                className="bg-success text-success-foreground hover:bg-success/90"
                onClick={() => setDialog('approve')}
              >
                <CheckCircle2Icon />
                Approve and publish
              </Button>
            </Can>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {moved && <ConflictBanner localJson={null} onReload={() => void reload()} />}
        {pinned.heldMatch && <HeldBanner match={pinned.heldMatch} />}
        {pinned.needsReview && <ProvenancePanel item={pinned} />}
        {d && inReview && <DeckTooShortAlert body={d.snapshot.body} message={tooShort} itemId={pinned.id} />}
        {d && <BoardSummary snapshot={d.snapshot} />}
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
        userId={staff ? `staff:${staff.id}` : undefined}
        open={dialog === 'approve'}
        onOpenChange={(o) => !o && setDialog(null)}
        onApprove={(v) => act(() => approve.mutateAsync({ rev: pinned.rev, ...v }), 'Approved and published')}
      />
      <FormDialog
        open={dialog === 'changes'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Request changes"
        description="The draft goes back to the editor with your note."
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

/** Source and session warnings on a queue row (once its detail has loaded). */
function QueueFlags({ item }: { item: ContentItem | undefined }) {
  if (!item) return null;
  const b = boardOfSnapshot(item.draft?.snapshot);
  const short = b ? sessionShortfalls(b.board, b.cards.length).length > 0 : false;
  const tooShort = !!goLiveShortfall(item.draft?.snapshot.body);
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      <Badge variant="outline" className="text-[10px]">
        {sourceLabel(item.provenance?.source)}
      </Badge>
      {tooShort && (
        <Badge variant="outline" className="border-destructive/50 text-[10px]">
          <AlertTriangleIcon className="size-3" />
          Too short to go live
        </Badge>
      )}
      {short && (
        <Badge variant="outline" className="border-warning/50 text-[10px]">
          <AlertTriangleIcon className="size-3" />
          Deck shorter than the session
        </Badge>
      )}
    </span>
  );
}

/** A board draft in words for the reviewer: its text and any deck shorter than the session. */
function BoardSummary({ snapshot }: { snapshot: ContentItem['live'] }) {
  const b = boardOfSnapshot(snapshot);
  if (!b) return null;
  const shortfalls = sessionShortfalls(b.board, b.cards.length);
  const sections = boardPreview(b.board, b.cards);
  return (
    <>
      {shortfalls.map((sf) => (
        <Alert key={`${sf.field}-${sf.deckName ?? ''}`} variant="warning">
          <AlertTriangleIcon />
          <AlertTitle>Deck shorter than the session</AlertTitle>
          <AlertDescription>{shortfallText(sf)}</AlertDescription>
        </Alert>
      ))}
      <section className="rounded-lg border p-3" aria-label="Board text">
        <h3 className="text-sm font-medium">{BOARD_LABEL[b.board.type]}: what the couple reads</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Sample names: {PREVIEW_NAMES.me} (you) and {PREVIEW_NAMES.partner} (partner).
        </p>
        <div className="flex flex-col gap-3">
          {sections.map((sec) => (
            <div key={sec.title}>
              <p className="text-xs font-medium text-muted-foreground">{sec.title}</p>
              <ul className="list-disc pl-4 text-sm">
                {sec.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
