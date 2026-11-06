import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { ImageIcon } from 'lucide-react';
import { columnHelper, DataTable, PageHeader, StatusBadge, type FacetedFilterConfig } from '@/components/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatRelative } from '@/lib/format';
import { cleanSearch } from '@/lib/search';
import { useSession } from '@/stores/session';
import { useAssignees, useTickets } from '../api/queries';
import { TICKET_PRIORITIES, TICKET_STATUSES, type Assignee, type SupportTicket } from '../api/types';
import { DeliveryProviderNotice } from '../components/delivery-notice';
import { assigneeName } from '../lib/assignee';
import { PRIORITY_LABEL, STATUS_LABEL } from '../lib/labels';
import type { SupportSearch } from '../schemas/support';

const route = getRouteApi('/_app/support/');
const h = columnHelper<SupportTicket>();

function useColumns(people: Assignee[] | undefined) {
  return h.columns([
    h.accessor('ref', {
      header: 'Ref',
      meta: { label: 'Reference', className: 'w-32' },
      cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
    }),
    h.accessor('kind', {
      header: 'Type',
      meta: { label: 'Type' },
      cell: (c) => (c.getValue() === 'message' ? (c.row.original.topic ?? 'Something else') : 'Problem report'),
    }),
    h.accessor('text', {
      header: 'Message',
      enableHiding: false,
      meta: { label: 'Message', className: 'max-w-[26rem]' },
      cell: (c) => (
        <span className="flex items-center gap-2">
          <span className="truncate">{c.getValue()}</span>
          {c.row.original.hasScreenshot && (
            <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Has a screenshot" />
          )}
        </span>
      ),
    }),
    h.accessor('priority', {
      header: 'Priority',
      meta: { label: 'Priority' },
      cell: (c) => <StatusBadge status={c.getValue()} label={PRIORITY_LABEL[c.getValue()]} />,
    }),
    h.accessor('status', {
      header: 'Status',
      meta: { label: 'Status' },
      cell: (c) => <StatusBadge status={c.getValue()} label={STATUS_LABEL[c.getValue()]} />,
    }),
    h.accessor('assigneeId', {
      header: 'Assignee',
      meta: { label: 'Assignee' },
      cell: (c) => assigneeName(c.row.original, people) ?? <span className="text-muted-foreground">Unassigned</span>,
    }),
    h.accessor('createdAt', {
      header: 'Received',
      meta: { label: 'Received' },
      cell: (c) => <span className="text-sm text-muted-foreground">{formatRelative(c.getValue())}</span>,
    }),
  ]);
}

export function SupportPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const go = useNavigate();
  const me = useSession((s) => s.staff);
  const status = search.status ?? 'open';
  const page = search.page ?? 1;
  const limit = search.limit ?? 20;
  const people = useAssignees().data;
  const columns = useColumns(people);
  const list = useTickets({
    status: status === 'all' ? undefined : status,
    priority: search.priority,
    assignee: search.assignee,
    userId: search.userId,
    q: search.q,
    page,
    limit,
  });

  const set = (patch: Partial<SupportSearch>, resetPage = true) =>
    navigate({
      search: (prev) => cleanSearch({ ...prev, ...(resetPage ? { page: undefined } : {}), ...patch }),
      replace: true,
    });

  const filters: FacetedFilterConfig[] = [
    {
      id: 'status',
      title: 'Status',
      options: [
        ...TICKET_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
        { value: 'all', label: 'Any status' },
      ],
      value: [status],
      onChange: (v) => set({ status: v[0] === 'open' || !v[0] ? undefined : (v[0] as SupportSearch['status']) }),
    },
    {
      id: 'priority',
      title: 'Priority',
      options: TICKET_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
      value: search.priority ? [search.priority] : [],
      onChange: (v) => set({ priority: (v[0] as SupportSearch['priority']) || undefined }),
    },
    {
      id: 'assignee',
      title: 'Assignee',
      options: [
        { value: 'me', label: 'Assigned to me' },
        { value: 'unassigned', label: 'Unassigned' },
        ...(people ?? []).filter((p) => p.id !== me?.id).map((p) => ({ value: p.id, label: p.displayName })),
      ],
      value: search.assignee ? [search.assignee] : [],
      onChange: (v) => set({ assignee: v[0] || undefined }),
    },
  ];

  return (
    <>
      <PageHeader
        title="Support inbox"
        description="Contact support messages and problem reports from the app, newest first."
      />
      <DeliveryProviderNotice />
      <DataTable
        id="support"
        label="Support tickets"
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
        onRowClick={(r) => void go({ to: '/support/$id', params: { id: r.id } })}
        toolbar={{
          search: {
            value: search.q ?? '',
            onChange: (q) => set({ q: q || undefined }),
            placeholder: 'Search reference or message',
            label: 'Search tickets',
          },
          filters,
          extra: (
            <div className="flex items-center gap-2">
              <Label htmlFor="support-user" className="sr-only">
                User id
              </Label>
              <Input
                id="support-user"
                key={search.userId ?? ''}
                defaultValue={search.userId ?? ''}
                placeholder="User id"
                className="h-8 w-44 font-mono text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void set({ userId: e.currentTarget.value.trim() || undefined });
                }}
                onBlur={(e) => {
                  const v = e.currentTarget.value.trim() || undefined;
                  if (v !== search.userId) void set({ userId: v });
                }}
              />
            </div>
          ),
          onReset: () => navigate({ search: (prev) => cleanSearch({ limit: prev.limit }), replace: true }),
        }}
        empty={{
          title: status === 'open' ? 'Inbox zero' : 'No tickets',
          description: status === 'open' ? 'No open ticket matches.' : 'Nothing matches these filters.',
        }}
      />
    </>
  );
}
