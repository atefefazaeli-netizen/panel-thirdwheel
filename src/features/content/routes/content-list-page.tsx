import { getRouteApi, Link } from '@tanstack/react-router';
import { FileJsonIcon, SendIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Can, DataTable, PageHeader, type FacetedFilterConfig } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { cleanSearch } from '@/lib/search';
import { useQueryClient } from '@tanstack/react-query';
import { contentApi } from '../api/content-api';
import { contentKeys, useContentFacets, useContentList } from '../api/queries';
import { LIST_STATES, ONLY_VALUES, type ContentPillar, type ContentSummary } from '../api/types';
import { contentColumns } from '../components/content-columns';
import { NewItemDialog } from '../components/new-item-dialog';
import { categoryLabel, ONLY_LABEL, PILLAR_LABEL, STATE_LABEL } from '../lib/labels';
import type { ContentSearch } from '../schemas/search';

const route = getRouteApi('/_app/content/');

export function ContentListPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const qc = useQueryClient();
  const page = search.page ?? 1;
  const limit = search.limit ?? 20;
  const { needsReview, ...rest } = search;
  const list = useContentList({
    ...rest,
    ...(needsReview === undefined ? {} : { needsReview: needsReview ? 'true' : 'false' }),
    page,
    limit,
  });
  const facets = useContentFacets();

  const set = (patch: Partial<ContentSearch>, resetPage = true) =>
    navigate({
      search: (prev) => cleanSearch({ ...prev, ...(resetPage ? { page: undefined } : {}), ...patch }),
      replace: true,
    });

  const filters: FacetedFilterConfig[] = [
    {
      id: 'state',
      title: 'State',
      value: search.state ? [search.state] : [],
      onChange: (v) => set({ state: v[0] as ContentSearch['state'] }),
      options: LIST_STATES.map((s) => ({ value: s, label: STATE_LABEL[s] })),
    },
    {
      id: 'category',
      title: 'Category',
      value: search.category ? [search.category] : [],
      onChange: (v) => set({ category: v[0] }),
      options: (facets.data?.categories ?? []).map((c) => ({ value: c, label: categoryLabel(c) })),
    },
    {
      id: 'type',
      title: 'Type',
      value: search.type ? [search.type] : [],
      onChange: (v) => set({ type: v[0] }),
      options: (facets.data?.types ?? []).map((t) => ({ value: t, label: t })),
    },
    {
      id: 'needsReview',
      title: 'Clinical review',
      value: search.needsReview === undefined ? [] : [String(search.needsReview)],
      onChange: (v) => set({ needsReview: v[0] === undefined ? undefined : v[0] === 'true' }),
      options: [
        { value: 'true', label: 'Needs clinical review' },
        { value: 'false', label: 'No review flags' },
      ],
    },
    {
      id: 'only',
      title: 'Only',
      value: search.only ? [search.only] : [],
      onChange: (v) => set({ only: v[0] as ContentSearch['only'] }),
      options: ONLY_VALUES.map((o) => ({ value: o, label: ONLY_LABEL[o]! })),
    },
  ];

  const submitMany = async (rows: ContentSummary[], clear: () => void) => {
    const ready = rows.filter((r) => r.draftState === 'editing' || r.draftState === 'changes_requested');
    if (ready.length === 0) {
      toast.info('None of the selected items has a draft to submit.');
      return;
    }
    const results = await Promise.allSettled(ready.map((r) => contentApi.submit(r.id, r.rev)));
    const failed = results.filter((r) => r.status === 'rejected');
    void qc.invalidateQueries({ queryKey: contentKeys.all });
    clear();
    if (failed.length)
      toast.error(
        `${failed.length} could not be submitted: ${errorMessage((failed[0] as PromiseRejectedResult).reason)}`,
      );
    toast.success(`${ready.length - failed.length} sent for review`);
  };

  return (
    <>
      <PageHeader
        title="Content"
        description="Release 1 quizzes, games and Do cards. Every change is a draft until a content reviewer approves it. Seeded content is not a clinician sign-off: filter Clinical review to see what still needs one."
        actions={
          <Can perm="content.edit">
            <Button variant="outline" asChild>
              <Link to="/content/import">
                <FileJsonIcon />
                Import
              </Link>
            </Button>
            <NewItemDialog defaultPillar={search.pillar ?? 'quiz'} />
          </Can>
        }
      />
      <Tabs
        value={search.pillar ?? 'all'}
        onValueChange={(v) => set({ pillar: v === 'all' ? undefined : (v as ContentPillar) })}
      >
        <TabsList aria-label="Pillar">
          <TabsTrigger value="all">All</TabsTrigger>
          {(['quiz', 'play', 'do'] as const).map((p) => (
            <TabsTrigger key={p} value={p}>
              {PILLAR_LABEL[p]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DataTable
        id="content"
        label="Content items"
        columns={contentColumns}
        data={list.data?.items}
        getRowId={(r) => r.id}
        page={page}
        pageSize={limit}
        total={list.data?.meta.total ?? 0}
        onPageChange={(p) => set({ page: p }, false)}
        onPageSizeChange={(l) => set({ limit: l })}
        loading={list.isPending}
        fetching={list.isFetching}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(r) => void navigate({ to: '/content/$id', params: { id: r.id } })}
        initialColumnVisibility={{ type: false, updatedAt: false }}
        selectable
        batchActions={({ rows, clear }) => (
          <Can perm="content.submit">
            <Button size="sm" variant="outline" className="h-8" onClick={() => void submitMany(rows, clear)}>
              <SendIcon />
              Submit drafts for review
            </Button>
          </Can>
        )}
        toolbar={{
          search: {
            value: search.q ?? '',
            onChange: (q) => set({ q: q || undefined }),
            placeholder: 'Search title, id or code',
            label: 'Search content',
          },
          filters,
          onReset: () =>
            navigate({ search: (prev) => cleanSearch({ pillar: prev.pillar, limit: prev.limit }), replace: true }),
        }}
        empty={{ title: 'No content matches', description: 'Try another search, pillar or filter.' }}
      />
    </>
  );
}
