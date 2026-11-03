import { getRouteApi } from '@tanstack/react-router';
import { AlertTriangleIcon, InfoIcon } from 'lucide-react';
import * as React from 'react';
import { useFormState } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDialog, ErrorState, PageHeader } from '@/components/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Form } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError, errorMessage } from '@/lib/api';
import { useRoles } from '@/stores/session';
import {
  useApproveContent,
  useContentFacets,
  useContentItem,
  useDiscardDraft,
  useRequestChanges,
  useRestoreContent,
  useSaveDraft,
  useSubmitContent,
  useUnpublishContent,
} from '../api/queries';
import type { ContentItem } from '../api/types';
import { CardsTab } from '../components/cards-tab';
import { CatalogTab } from '../components/catalog-tab';
import { ContentStateBadge } from '../components/content-state-badge';
import { DeckTab } from '../components/deck-tab';
import { HistoryTab } from '../components/history-tab';
import { PreviewPanel } from '../components/preview-panel';
import { StepsTab } from '../components/steps-tab';
import { WorkflowBar } from '../components/workflow-bar';
import { editableSnapshot, useContentEditor } from '../hooks/use-content-editor';
import { useUnsavedGuard } from '../hooks/use-unsaved-guard';
import { contentState, KIND_LABEL, PILLAR_LABEL, playsField } from '../lib/labels';
import { workflowFor } from '../lib/workflow';
import { formToSnapshot, snapshotBytes, snapshotToForm, LIMITS } from '../schemas/editor';

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
  const { isAdmin, user } = useRoles();
  const facets = useContentFacets();
  const form = useContentEditor(item);
  const { isDirty, isValid } = useFormState({ control: form.control });
  const [problems, setProblems] = React.useState<string[] | null>(null);

  const save = useSaveDraft(item.id);
  const discard = useDiscardDraft(item.id);
  const submit = useSubmitContent(item.id);
  const approve = useApproveContent(item.id);
  const changes = useRequestChanges(item.id);
  const unpublish = useUnpublishContent(item.id);
  const restore = useRestoreContent(item.id);
  const busy = [save, discard, submit, approve, changes, unpublish, restore].some((m) => m.isPending);

  const readOnly = !isAdmin;
  const wf = workflowFor(item, user?.roles ?? [], { dirty: isDirty, valid: isValid, busy });
  const blocker = useUnsavedGuard(isDirty && !readOnly);
  const plays = playsField(item.kind);
  const title = (editableSnapshot(item).catalog.title as string) || item.id;
  const categories = [
    ...new Set([
      ...(facets.data?.categories ?? []),
      ...(item.live?.catalog.category ? [item.live.catalog.category] : []),
    ]),
  ];

  const onSave = form.handleSubmit(
    async (values) => {
      const snapshot = formToSnapshot(values);
      if (snapshotBytes(snapshot) > LIMITS.snapshotBytes) {
        setProblems(['snapshot: at most 256 KB']);
        return;
      }
      try {
        setProblems(null);
        const saved = await save.mutateAsync(snapshot);
        form.reset(snapshotToForm(editableSnapshot(saved)));
        toast.success('Draft saved');
      } catch (e) {
        const details = serverProblems(e);
        if (details) setProblems(details);
        else if (e instanceof ApiError && e.code === 'CONTENT_CONFLICT')
          toast.error('Someone else changed this item first. Reload to see their changes.');
        else toast.error(errorMessage(e));
      }
    },
    () => toast.error('Some fields need attention before saving.'),
  );

  return (
    <Form {...form}>
      <PageHeader
        title={title}
        meta={
          <>
            <ContentStateBadge state={contentState(item)} version={item.liveVersion} />
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
        workflow={wf}
        dirty={isDirty}
        onSave={() => void onSave()}
        onResetLocal={() => form.reset(snapshotToForm(editableSnapshot(item)))}
        onDiscard={() => discard.mutateAsync(undefined)}
        onSubmit={(note) => submit.mutateAsync(note)}
        onApprove={(note) => approve.mutateAsync(note)}
        onRequestChanges={(note) => changes.mutateAsync(note)}
        onUnpublish={() => unpublish.mutateAsync(undefined)}
        onRestore={() => restore.mutateAsync(undefined)}
      />
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
              <HistoryTab item={item} />
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
