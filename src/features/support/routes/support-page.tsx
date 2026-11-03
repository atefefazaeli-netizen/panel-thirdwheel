import { getRouteApi } from '@tanstack/react-router';
import { ImageIcon } from 'lucide-react';
import {
  columnHelper,
  DataTable,
  DrawerPreview,
  EmptyState,
  ErrorState,
  ForbiddenState,
  PageHeader,
  RoleGate,
  StatusBadge,
} from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatRelative } from '@/lib/format';
import { cleanSearch } from '@/lib/search';
import { useTicket, useTickets } from '../api/queries';
import type { SupportTicket } from '../api/types';
import { TicketDetail } from '../components/ticket-detail';
import type { SupportSearch } from '../schemas/support';

const route = getRouteApi('/_app/support/');
const h = columnHelper<SupportTicket>();
const columns = h.columns([
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
    meta: { label: 'Message', className: 'max-w-[28rem]' },
    cell: (c) => (
      <span className="flex items-center gap-2">
        <span className="truncate">{c.getValue()}</span>
        {c.row.original.hasScreenshot && (
          <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Has a screenshot" />
        )}
      </span>
    ),
  }),
  h.accessor('status', {
    header: 'Status',
    meta: { label: 'Status' },
    cell: (c) => <StatusBadge status={c.getValue()} />,
  }),
  h.accessor('createdAt', {
    header: 'Received',
    meta: { label: 'Received' },
    cell: (c) => <span className="text-sm text-muted-foreground">{formatRelative(c.getValue())}</span>,
  }),
]);

export function SupportPage() {
  return (
    <RoleGate allow="admin" fallback={<ForbiddenState what="the support inbox" />}>
      <Inbox />
    </RoleGate>
  );
}

function Inbox() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const status = search.status ?? 'open';
  const page = search.page ?? 1;
  const limit = search.limit ?? 20;
  const list = useTickets({ status: status === 'all' ? undefined : status, page, limit });
  const ticket = useTicket(search.ticket ?? null);

  const set = (patch: Partial<SupportSearch>, resetPage = true) =>
    navigate({
      search: (prev) => cleanSearch({ ...prev, ...(resetPage ? { page: undefined } : {}), ...patch }),
      replace: true,
    });

  return (
    <>
      <PageHeader
        title="Support inbox"
        description="Contact support messages and problem reports from the app, newest first."
      />
      <Tabs
        value={status}
        onValueChange={(v) => set({ status: v === 'open' ? undefined : (v as SupportSearch['status']) })}
      >
        <TabsList aria-label="Ticket status">
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>
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
        onRowClick={(r) => set({ ticket: r.id }, false)}
        toolbar={{}}
        empty={{
          title: status === 'open' ? 'Inbox zero' : 'No tickets',
          description: status === 'open' ? 'Every ticket is closed.' : 'Nothing here.',
        }}
      />
      <DrawerPreview
        open={!!search.ticket}
        onOpenChange={(o) => !o && set({ ticket: undefined }, false)}
        title="Ticket"
        description={ticket.data?.ref}
      >
        {ticket.error ? (
          <ErrorState error={ticket.error} />
        ) : ticket.isPending ? (
          <Skeleton className="h-64" />
        ) : ticket.data ? (
          <TicketDetail ticket={ticket.data} />
        ) : (
          <EmptyState title="Ticket not found" description="It may have been deleted with the account." />
        )}
      </DrawerPreview>
    </>
  );
}
