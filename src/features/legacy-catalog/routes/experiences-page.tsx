import { getRouteApi } from '@tanstack/react-router';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import {
  columnHelper,
  ConfirmDialog,
  DataTable,
  ForbiddenState,
  PageHeader,
  RoleGate,
  type FacetedFilterConfig,
} from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cleanSearch } from '@/lib/search';
import { useDeleteExperience, useExperienceMeta, useExperiences } from '../api/queries';
import { EXP_KEYS, type Experience, type ExperienceQuery } from '../api/types';
import { ExperienceEditor } from '../components/experience-editor';
import { LegacyBadge } from '../components/legacy-badge';

const route = getRouteApi('/_app/experiences');

export function ExperiencesPage() {
  return (
    <RoleGate allow="admin" fallback={<ForbiddenState what="experiences" />}>
      <Experiences />
    </RoleGate>
  );
}

function Experiences() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const page = search.page ?? 1;
  const limit = search.limit ?? 20;
  const list = useExperiences({ exp: search.exp, page, limit });
  const meta = useExperienceMeta();
  const labels = meta.data?.labels ?? {};
  const del = useDeleteExperience();
  const [editing, setEditing] = React.useState<Experience | null | 'new'>(null);
  const [retiring, setRetiring] = React.useState<Experience | null>(null);
  const set = (patch: Partial<ExperienceQuery>, resetPage = true) =>
    navigate({
      search: (prev) => cleanSearch({ ...prev, ...(resetPage ? { page: undefined } : {}), ...patch }),
      replace: true,
    });

  const h = columnHelper<Experience>();
  const columns = h.columns([
    h.accessor('id', {
      header: 'Id',
      meta: { label: 'Id' },
      cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
    }),
    h.accessor('exp', {
      header: 'Bucket',
      meta: { label: 'Bucket' },
      cell: (c) => <Badge variant="secondary">{labels[c.getValue()] ?? c.getValue()}</Badge>,
    }),
    h.accessor('title', {
      header: 'Title',
      enableHiding: false,
      meta: { label: 'Title' },
      cell: (c) => <span className="font-medium">{c.getValue()}</span>,
    }),
    h.accessor('meta', {
      header: 'Meta',
      meta: { label: 'Meta', className: 'max-w-64' },
      cell: (c) => <span className="block truncate text-sm text-muted-foreground">{c.getValue()}</span>,
    }),
    h.accessor('only', {
      header: 'Only for',
      meta: { label: 'Only for' },
      cell: (c) => {
        const o = c.getValue();
        const parts = o ? [...(o.dur ?? []), ...(o.kids ?? []), ...(o.living ?? [])] : [];
        return parts.length ? (
          <span className="font-mono text-xs">{parts.join(', ')}</span>
        ) : (
          <span className="text-muted-foreground">Everyone</span>
        );
      },
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
      id: 'exp',
      title: 'Bucket',
      value: search.exp ? [search.exp] : [],
      onChange: (v) => set({ exp: v[0] as ExperienceQuery['exp'] }),
      options: EXP_KEYS.map((k) => ({ value: k, label: labels[k] ?? k })),
    },
  ];

  return (
    <>
      <PageHeader
        title="Experiences"
        meta={<LegacyBadge />}
        description="The round 1 experience pool. Release 1 Explore reads the Content CMS."
        actions={
          <Button onClick={() => setEditing('new')}>
            <PlusIcon />
            New experience
          </Button>
        }
      />
      <DataTable
        id="experiences"
        label="Experiences"
        columns={columns}
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
        onRowClick={(r) => setEditing(r)}
        toolbar={{ filters, onReset: () => void navigate({ search: {}, replace: true }) }}
      />
      <ExperienceEditor
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        experience={editing === 'new' ? null : editing}
        labels={labels}
      />
      <ConfirmDialog
        open={!!retiring}
        onOpenChange={(o) => !o && setRetiring(null)}
        title={`Retire “${retiring?.title}”?`}
        description="It leaves the experience pool."
        confirmLabel="Retire experience"
        cancelLabel="Keep experience"
        destructive
        onConfirm={async () => {
          await del.mutateAsync(retiring!.id);
          toast.success('Experience retired');
        }}
      />
    </>
  );
}
