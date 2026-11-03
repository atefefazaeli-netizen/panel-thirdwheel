import { getRouteApi, Link } from '@tanstack/react-router';
import { AlertOctagonIcon, ExternalLinkIcon, FlagIcon, ShieldAlertIcon, TimerIcon, XIcon } from 'lucide-react';
import {
  DataTable,
  DrawerPreview,
  ErrorState,
  PageHeader,
  StatCard,
  type FacetedFilterConfig,
} from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cleanSearch } from '@/lib/search';
import { useSafetyFlag, useSafetyFlags, useSafetySummary } from '../api/queries';
import { KINDS, LEVELS, STATUSES, SURFACES } from '../api/types';
import { flagColumns } from '../components/flag-columns';
import { FlagDetail } from '../components/flag-detail';
import { KIND_LABEL, SURFACE_LABEL } from '../lib/labels';
import type { SafetySearch } from '../schemas/safety';

const route = getRouteApi('/_app/safety/');
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export function SafetyPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const page = search.page ?? 1;
  const limit = search.limit ?? 20;
  const { surface, flag: openFlag, ...apiQuery } = search;
  const list = useSafetyFlags({ ...apiQuery, page, limit });
  const summary = useSafetySummary();
  const selected = useSafetyFlag(openFlag ?? null);

  const set = (patch: Partial<SafetySearch>, resetPage = true) =>
    navigate({
      search: (prev) => cleanSearch({ ...prev, ...(resetPage ? { page: undefined } : {}), ...patch }),
      replace: true,
    });

  const one = <K extends keyof SafetySearch>(key: K) => (search[key] ? [String(search[key])] : []);
  const filters: FacetedFilterConfig[] = [
    {
      id: 'status',
      title: 'Status',
      value: one('status'),
      onChange: (v) => set({ status: v[0] as SafetySearch['status'] }),
      options: STATUSES.map((s) => ({ value: s, label: cap(s) })),
    },
    {
      id: 'level',
      title: 'Level',
      value: one('level'),
      onChange: (v) => set({ level: v[0] as SafetySearch['level'] }),
      options: LEVELS.map((s) => ({ value: s, label: cap(s) })),
    },
    {
      id: 'kind',
      title: 'Check',
      value: one('kind'),
      onChange: (v) => set({ kind: v[0] as SafetySearch['kind'] }),
      options: KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })),
    },
    {
      id: 'surface',
      title: 'Where (this page)',
      value: one('surface'),
      onChange: (v) => set({ surface: v[0] as SafetySearch['surface'] }, false),
      options: SURFACES.map((s) => ({ value: s, label: SURFACE_LABEL[s] })),
    },
  ];
  // The API has no surface filter: narrow the loaded page only.
  const rows = list.data?.items.filter((f) => !surface || f.surface === surface);
  const s = summary.data;

  return (
    <>
      <PageHeader
        title="Safety"
        description="Crisis, safety and heat checks from the app and the server. Thirdwheel never stores what was typed: flags are metadata only."
      />
      {summary.error ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Open"
            value={s?.open}
            loading={summary.isPending}
            icon={FlagIcon}
            tone="warning"
            hint={s ? `${s.openMedium} medium · ${s.openLow} low` : undefined}
          />
          <StatCard
            label="Open high"
            value={s?.openHigh}
            loading={summary.isPending}
            icon={AlertOctagonIcon}
            tone="brand"
            hint="Crisis checks waiting"
          />
          <StatCard label="Last 24 hours" value={s?.last24h} loading={summary.isPending} icon={TimerIcon} />
          <StatCard label="Last 7 days" value={s?.last7d} loading={summary.isPending} icon={ShieldAlertIcon} />
        </div>
      )}
      {search.userId && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 font-mono">
            Person {search.userId}
            <button
              type="button"
              onClick={() => set({ userId: undefined })}
              aria-label="Clear the person filter"
              className="hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        </div>
      )}
      <DataTable
        id="safety"
        label="Safety flags"
        columns={flagColumns}
        data={rows}
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
        onRowClick={(r) => set({ flag: r.id }, false)}
        initialColumnVisibility={{ notes: false }}
        toolbar={{
          filters,
          extra: (
            <>
              <div className="flex items-center gap-1.5">
                <Label htmlFor="flags-from" className="text-xs font-normal text-muted-foreground">
                  From
                </Label>
                <Input
                  id="flags-from"
                  type="date"
                  value={search.from ?? ''}
                  onChange={(e) => set({ from: e.target.value || undefined })}
                  className="h-8 w-[9.5rem]"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label htmlFor="flags-to" className="text-xs font-normal text-muted-foreground">
                  To
                </Label>
                <Input
                  id="flags-to"
                  type="date"
                  value={search.to ?? ''}
                  onChange={(e) => set({ to: e.target.value || undefined })}
                  className="h-8 w-[9.5rem]"
                />
              </div>
            </>
          ),
          onReset: () => navigate({ search: (prev) => cleanSearch({ limit: prev.limit }), replace: true }),
        }}
        empty={{ title: 'No flags match', description: 'Nothing to look at with these filters.' }}
      />
      <DrawerPreview
        open={!!openFlag}
        onOpenChange={(o) => !o && set({ flag: undefined }, false)}
        title={selected.data ? `${KIND_LABEL[selected.data.kind]} check` : 'Flag'}
        description={selected.data?.userEmail ?? undefined}
        footer={
          openFlag && (
            <Button variant="outline" asChild>
              <Link to="/safety/$id" params={{ id: openFlag }}>
                <ExternalLinkIcon />
                Open as a page
              </Link>
            </Button>
          )
        }
      >
        {selected.error ? (
          <ErrorState error={selected.error} />
        ) : selected.data ? (
          <FlagDetail flag={selected.data} />
        ) : (
          <Skeleton className="h-64" />
        )}
      </DrawerPreview>
    </>
  );
}
