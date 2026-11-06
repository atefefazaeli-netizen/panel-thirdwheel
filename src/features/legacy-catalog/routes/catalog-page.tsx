import { getRouteApi } from '@tanstack/react-router';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import {
  columnHelper,
  ConfirmDialog,
  DataTable,
  PageHeader,
  RequirePermission,
  type FacetedFilterConfig,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cleanSearch } from '@/lib/search';
import { useCatalogItems, useDeleteCatalogItem } from '../api/queries';
import { CATALOG_KINDS, type CatalogItem, type CatalogQuery } from '../api/types';
import { BookingLinksCard } from '../components/booking-links-card';
import { ItemEditor } from '../components/item-editor';
import { LegacyBadge } from '../components/legacy-badge';

const route = getRouteApi('/_app/catalog');

export function CatalogPage() {
  return (
    <RequirePermission perm="catalog.manage" what="the legacy catalog">
      <Catalog />
    </RequirePermission>
  );
}

function Catalog() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const page = search.page ?? 1;
  const limit = search.limit ?? 20;
  const list = useCatalogItems({ where: search.where, kind: search.kind, maxUsd: search.maxUsd, page, limit });
  const del = useDeleteCatalogItem();
  const [editing, setEditing] = React.useState<CatalogItem | null | 'new'>(null);
  const [retiring, setRetiring] = React.useState<CatalogItem | null>(null);
  const [maxDraft, setMaxDraft] = React.useState(search.maxUsd?.toString() ?? '');
  const set = (patch: Partial<CatalogQuery>, resetPage = true) =>
    navigate({
      search: (prev) => cleanSearch({ ...prev, ...(resetPage ? { page: undefined } : {}), ...patch }),
      replace: true,
    });

  const h = columnHelper<CatalogItem>();
  const columns = h.columns([
    h.accessor('id', {
      header: 'Id',
      meta: { label: 'Id', className: 'w-14' },
      cell: (c) => <span className="font-mono text-xs text-muted-foreground">{c.getValue()}</span>,
    }),
    h.accessor('title', {
      header: 'Title',
      enableHiding: false,
      meta: { label: 'Title' },
      cell: (c) => <span className="font-medium">{c.getValue()}</span>,
    }),
    h.accessor('kind', {
      header: 'Kind',
      meta: { label: 'Kind' },
      cell: (c) => <span className="capitalize">{c.getValue()}</span>,
    }),
    h.accessor('where', {
      header: 'Where',
      meta: { label: 'Where' },
      cell: (c) => (c.getValue() === 'home' ? 'At home' : 'Out'),
    }),
    h.accessor('usd', {
      header: 'Price',
      meta: { label: 'Price' },
      cell: (c) => (c.getValue() ? `$${c.getValue()}${c.row.original.per ?? ''}` : 'Free'),
    }),
    h.accessor('provider', {
      header: 'Provider',
      meta: { label: 'Provider' },
      cell: (c) => c.getValue() ?? <span className="text-muted-foreground">–</span>,
    }),
    h.display({
      id: 'actions',
      enableHiding: false,
      meta: { className: 'w-12' },
      cell: (c) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Retire ${c.row.original.title}`}
          onClick={(e) => {
            e.stopPropagation();
            setRetiring(c.row.original);
          }}
        >
          <Trash2Icon />
        </Button>
      ),
    }),
  ]);

  const filters: FacetedFilterConfig[] = [
    {
      id: 'where',
      title: 'Where',
      value: search.where ? [search.where] : [],
      onChange: (v) => set({ where: v[0] as CatalogQuery['where'] }),
      options: [
        { value: 'out', label: 'Out' },
        { value: 'home', label: 'At home' },
      ],
    },
    {
      id: 'kind',
      title: 'Kind',
      value: search.kind ? [search.kind] : [],
      onChange: (v) => set({ kind: v[0] as CatalogQuery['kind'] }),
      options: CATALOG_KINDS.map((k) => ({ value: k, label: k })),
    },
  ];

  return (
    <>
      <PageHeader
        title="Date ideas"
        meta={<LegacyBadge />}
        description="The round 1 idea catalog (catalog/items). Release 1 Explore reads the Content CMS; edit this only for builds that still use round 1 ideas."
        actions={
          <Button onClick={() => setEditing('new')}>
            <PlusIcon />
            New idea
          </Button>
        }
      />
      <DataTable
        id="catalog"
        label="Date ideas"
        columns={columns}
        data={list.data?.items}
        getRowId={(r) => String(r.id)}
        page={page}
        pageSize={limit}
        total={list.data?.meta.total ?? 0}
        onPageChange={(p) => set({ page: p }, false)}
        onPageSizeChange={(l) => set({ limit: l })}
        loading={list.isPending}
        fetching={list.isFetching}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(r) => setEditing(r)}
        toolbar={{
          filters,
          extra: (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                set({ maxUsd: maxDraft ? Number(maxDraft) : undefined });
              }}
            >
              <Label htmlFor="max-usd" className="text-xs font-normal text-muted-foreground">
                Max $
              </Label>
              <Input
                id="max-usd"
                type="number"
                min={0}
                value={maxDraft}
                onChange={(e) => setMaxDraft(e.target.value)}
                onBlur={() => set({ maxUsd: maxDraft ? Number(maxDraft) : undefined })}
                className="h-8 w-20"
              />
            </form>
          ),
          onReset: () => {
            setMaxDraft('');
            void navigate({ search: {}, replace: true });
          },
        }}
      />
      <BookingLinksCard />
      <ItemEditor
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        item={editing === 'new' ? null : editing}
      />
      <ConfirmDialog
        open={!!retiring}
        onOpenChange={(o) => !o && setRetiring(null)}
        title={`Retire “${retiring?.title}”?`}
        description="It leaves the catalog. It is kept for booking history."
        confirmLabel="Retire idea"
        cancelLabel="Keep idea"
        destructive
        onConfirm={async () => {
          await del.mutateAsync(retiring!.id);
          toast.success('Idea retired');
        }}
      />
    </>
  );
}
