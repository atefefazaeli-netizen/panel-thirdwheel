import { getRouteApi } from '@tanstack/react-router';
import { AlertTriangleIcon, InfoIcon } from 'lucide-react';
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useFormState, type FieldPath } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDialog, ErrorState, PageHeader } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Form } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError, errorMessage } from '@/lib/api';
import { useRoles } from '@/stores/session';
import { contentApi } from '../api/content-api';
import {
  contentKeys,
  useApproveContent,
  useContentFacets,
  useContentItem,
  useDiscardDraft,
  useRequestChanges,
  useRestoreContent,
  useRollbackContent,
  useSaveDraft,
  useSubmitContent,
  useUnpublishContent,
} from '../api/queries';
import type { ContentItem } from '../api/types';
import { CardsTab } from '../components/cards-tab';
import { CatalogTab } from '../components/catalog-tab';
import { ConflictBanner } from '../components/conflict-banner';
import { ContentStateBadge } from '../components/content-state-badge';
import { DeckTab } from '../components/deck-tab';
import { HistoryTab } from '../components/history-tab';
import { PreviewPanel } from '../components/preview-panel';
import { HeldBadge, HeldBanner, NeedsReviewBadge, ProvenancePanel } from '../components/review-status';
import { StepsTab } from '../components/steps-tab';
import { WorkflowBar } from '../components/workflow-bar';
import { editableSnapshot, useContentEditor } from '../hooks/use-content-editor';
import { useUnsavedGuard } from '../hooks/use-unsaved-guard';
import { contentState, KIND_LABEL, PILLAR_LABEL, playsField } from '../lib/labels';
import { detailsToFieldErrors, isConflict } from '../lib/review';
import { workflowFor } from '../lib/workflow';
import { formToSnapshot, snapshotBytes, LIMITS, type EditorValues } from '../schemas/editor';

const route = getRouteApi('/_app/content/$id');

export function ContentItemPage() {
  const { id } = route.useParams();
  const item = useContentItem(id);
  if (item.error)
    return <ErrorState error={item.error} title="Could not load this item" onRetry={() => void item.refetch()} />;
  if (!item.data)
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  return <Editor key={item.data.id} item={item.data} />;
}

function serverProblems(e: unknown): string[] | null {
  return e instanceof ApiError && e.code === 'INVALID_CONTENT' && Array.isArray(e.details)
    ? (e.details as string[])
    : null;
}

function Editor({ item }: { item: ContentItem }) {
  const { tab = 'catalog' } = route.useSearch();
  const navigate = route.useNavigate();
  const qc = useQueryClient();
  const { isAdmin, user } = useRoles();
  const facets = useContentFacets();
  const { form, baseRev, stale, markConflict, resetTo, setWriting } = useContentEditor(item);
  const { isDirty, isValid } = useFormState({ control: form.control });
  const [problems, setProblems] = React.useState<string[] | null>(null);
  const [reloading, setReloading] = React.useState(false);

  const save = useSaveDraft(item.id);
  const discard = useDiscardDraft(item.id);
  const submit = useSubmitContent(item.id);
  const approve = useApproveContent(item.id);
  const changes = useRequestChanges(item.id);
  const unpublish = useUnpublishContent(item.id);
  const restore = useRestoreContent(item.id);
  const rollback = useRollbackContent(item.id);
  const busy = [save, discard, submit, approve, changes, unpublish, restore, rollback].some((m) => m.isPending);

  const readOnly = !isAdmin;
  const wf = workflowFor(item, user?.roles ?? [], { dirty: isDirty, valid: isValid, busy, stale });
  const blocker = useUnsavedGuard(isDirty && !readOnly);
  const plays = playsField(item.kind);
  const title = (editableSnapshot(item).catalog.title as string) || item.id;
  const categories = [
    ...new Set([
      ...(facets.data?.categories ?? []),
      ...(item.live?.catalog.category ? [item.live.catalog.category] : []),
    ]),
  ];

  /**
   * Runs one write with the revision this screen is based on. A 409 CONTENT_CONFLICT keeps every
   * local edit and shows the conflict banner (the dialog closes); other errors toast and keep the
   * dialog open.
   */
  const act = async (fn: (rev: number) => Promise<ContentItem>, done?: string) => {
    setWriting(true);
    try {
      const saved = await fn(baseRev);
      resetTo(saved);
      if (done) toast.success(done);
    } catch (e) {
      if (isConflict(e)) {
        markConflict();
        return;
      }
      toast.error(errorMessage(e));
      throw e;
    } finally {
      setWriting(false);
    }
  };

  const reload = async () => {
    setReloading(true);
    try {
      const fresh = await qc.fetchQuery({ queryKey: contentKeys.item(item.id), queryFn: () => contentApi.get(item.id), staleTime: 0 });
      resetTo(fresh);
      setProblems(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setReloading(false);
    }
  };

  const onSave = form.handleSubmit(
    async (values) => {
      const snapshot = formToSnapshot(values);
      if (snapshotBytes(snapshot) > LIMITS.snapshotBytes) {
        setProblems(['snapshot: at most 256 KB']);
        return;
      }
      setProblems(null);
      try {
        await act((rev) => save.mutateAsync({ snapshot, rev }), 'Draft saved');
      } catch (e) {
        const details = serverProblems(e);
        if (!details) return;
        // Field-level: mark each field the server named; list everything above the tabs.
        const { mapped } = detailsToFieldErrors(details);
        for (const m of mapped) form.setError(m.path as FieldPath<EditorValues>, { type: 'server', message: m.message });
        setProblems(details);
      }
    },
    () => toast.error('Some fields need attention before saving.'),
  );

  const localJson = isDirty ? JSON.stringify(formToSnapshot(form.getValues()), null, 2) : null;

  return (
    <Form {...form}>
      <PageHeader
        title={title}
        meta={
          <>
            <ContentStateBadge state={contentState(item)} version={item.liveVersion} />
            {item.needsReview && <NeedsReviewBadge />}
            {item.heldMatch && <HeldBadge />}
            {item.draft?.source === 'n8n' && <Badge variant="outline">From n8n</Badge>}
          </>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="font-mono">{item.code ?? 'No code'}</span>·<span>{PILLAR_LABEL[item.pillar]}</span>·
            <span>{KIND_LABEL[item.kind] ?? item.kind}</span>·<span className="font-mono">{item.id}</span>
          </span>
        }
      />
      <WorkflowBar
        item={item}
        userId={user?.userId}
        workflow={wf}
        dirty={isDirty}
        onSave={() => void onSave()}
        onResetLocal={() => resetTo(item)}
        onDiscard={() => act((rev) => discard.mutateAsync({ rev }), 'Draft discarded')}
        onSubmit={(note) => act((rev) => submit.mutateAsync({ rev, note }), 'Sent for review')}
        onApprove={(v) => act((rev) => approve.mutateAsync({ rev, ...v }), 'Approved and published')}
        onRequestChanges={(note) => act((rev) => changes.mutateAsync({ rev, note }), 'Sent back with your note')}
        onUnpublish={() => act((rev) => unpublish.mutateAsync({ rev }), 'Unpublished')}
        onRestore={() => act((rev) => restore.mutateAsync({ rev }), 'Restored')}
      />
      {stale && <ConflictBanner localJson={localJson} onReload={() => void reload()} reloading={reloading} />}
      {item.heldMatch && <HeldBanner match={item.heldMatch} />}
      <ProvenancePanel item={item} />
      {readOnly && (
        <Alert>
          <InfoIcon />
          <AlertTitle>Read only</AlertTitle>
          <AlertDescription>Clinicians review and approve here. Admins edit drafts.</AlertDescription>
        </Alert>
      )}
      {problems && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>The server did not accept this draft</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={(t) => void navigate({ search: { tab: t as typeof tab }, replace: true })}>
            <TabsList className="w-full justify-start overflow-x-auto sm:w-fit" aria-label="Editor sections">
              <TabsTrigger value="catalog">Catalog</TabsTrigger>
              <TabsTrigger value="cards">
                Cards {plays === 'cards' && <span className="size-1.5 rounded-full bg-brand" aria-label="(plays)" />}
              </TabsTrigger>
              <TabsTrigger value="steps">
                Steps {plays === 'steps' && <span className="size-1.5 rounded-full bg-brand" aria-label="(plays)" />}
              </TabsTrigger>
              <TabsTrigger value="deck">
                Deck {plays === 'deck' && <span className="size-1.5 rounded-full bg-brand" aria-label="(plays)" />}
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="catalog" className="mt-2">
              <fieldset disabled={readOnly} className="min-w-0">
                <CatalogTab categories={categories} kind={item.kind} />
              </fieldset>
            </TabsContent>
            <TabsContent value="cards" className="mt-2">
              <fieldset disabled={readOnly} className="min-w-0">
                <CardsTab readOnly={readOnly} plays={plays === 'cards'} />
              </fieldset>
            </TabsContent>
            <TabsContent value="steps" className="mt-2">
              <fieldset disabled={readOnly} className="min-w-0">
                <StepsTab readOnly={readOnly} plays={plays === 'steps'} />
              </fieldset>
            </TabsContent>
            <TabsContent value="deck" className="mt-2">
              <fieldset disabled={readOnly} className="min-w-0">
                <DeckTab readOnly={readOnly} required={plays === 'deck'} />
              </fieldset>
            </TabsContent>
            <TabsContent value="history" className="mt-2">
              <HistoryTab
                item={item}
                dirty={isDirty}
                onRollback={(version, note) =>
                  act((rev) => rollback.mutateAsync({ version, rev, note }), `Version ${version} is live again`)
                }
              />
            </TabsContent>
          </Tabs>
        </div>
        <aside className="xl:sticky xl:top-32">
          <PreviewPanel kind={item.kind} />
        </aside>
      </div>
      <ConfirmDialog
        open={blocker.status === 'blocked'}
        onOpenChange={(o) => !o && blocker.status === 'blocked' && blocker.reset()}
        title="Leave without saving?"
        description="Your edits to this item are not saved yet."
        confirmLabel="Leave without saving"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => blocker.status === 'blocked' && blocker.proceed()}
      />
    </Form>
  );
}
