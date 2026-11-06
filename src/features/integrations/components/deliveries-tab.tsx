import { RotateCwIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  columnHelper,
  CopyButton,
  DataTable,
  DrawerPreview,
  StatusBadge,
  type FacetedFilterConfig,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/stores/session';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useDeliveries, useRetryDelivery, useWebhooks } from '../api/queries';
import { DELIVERY_EVENTS, DELIVERY_STATUSES, type Delivery } from '../api/types';
import { EVENT_LABEL } from '../lib/labels';
import type { IntegrationsSearch } from '../schemas/integrations';

export interface DeliveriesTabProps {
  search: IntegrationsSearch;
  set: (patch: Partial<IntegrationsSearch>, resetPage?: boolean) => void;
  onReset: () => void;
}

export function DeliveriesTab({ search, set, onReset }: DeliveriesTabProps) {
  const page = search.page ?? 1;
  const limit = search.limit ?? 20;
  const list = useDeliveries({ webhookId: search.webhookId, event: search.event, status: search.status, page, limit });
  const hooks = useWebhooks();
  const retry = useRetryDelivery();
  const canManage = useCan('integrations.manage');
  const nameOf = (id: string) => hooks.data?.find((w) => w.id === id)?.name ?? 'Deleted webhook';
  const open = list.data?.items.find((d) => d.id === search.delivery) ?? null;

  const doRetry = async (d: Delivery) => {
    try {
      await retry.mutateAsync(d.id);
      toast.success('Retry queued: a fresh run of 6 attempts');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const h = columnHelper<Delivery>();
  const columns = h.columns([
    h.accessor('status', {
      header: 'Status',
      meta: { label: 'Status' },
      cell: (c) => <StatusBadge status={c.getValue()} />,
    }),
    h.accessor('event', {
      header: 'Event',
      enableHiding: false,
      meta: { label: 'Event' },
      cell: (c) => <span className="font-medium">{EVENT_LABEL[c.getValue()]}</span>,
    }),
    h.accessor('webhookId', { header: 'Webhook', meta: { label: 'Webhook' }, cell: (c) => nameOf(c.getValue()) }),
    h.accessor('attempts', {
      header: 'Attempts',
      meta: { label: 'Attempts', className: 'text-right w-20' },
      cell: (c) => <span className="tabular-nums">{c.getValue()}/6</span>,
    }),
    h.accessor('lastStatusCode', {
      header: 'Last answer',
      meta: { label: 'Last answer' },
      cell: (c) =>
        c.getValue() ? (
          <span className="font-mono text-xs">{c.getValue()}</span>
        ) : (
          <span className="text-muted-foreground">–</span>
        ),
    }),
    h.accessor('createdAt', {
      header: 'Created',
      meta: { label: 'Created' },
      cell: (c) => <span className="text-sm text-muted-foreground">{formatRelative(c.getValue())}</span>,
    }),
    h.display({
      id: 'actions',
      enableHiding: false,
      meta: { className: 'w-24 text-right' },
      cell: (c) =>
        canManage && c.row.original.status !== 'pending' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              void doRetry(c.row.original);
            }}
          >
            <RotateCwIcon />
            Retry
          </Button>
        ) : null,
    }),
  ]);

  const one = <K extends keyof IntegrationsSearch>(k: K) => (search[k] ? [String(search[k])] : []);
  const filters: FacetedFilterConfig[] = [
    {
      id: 'status',
      title: 'Status',
      value: one('status'),
      onChange: (v) => set({ status: v[0] as IntegrationsSearch['status'] }),
      options: DELIVERY_STATUSES.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) })),
    },
    {
      id: 'event',
      title: 'Event',
      value: one('event'),
      onChange: (v) => set({ event: v[0] as IntegrationsSearch['event'] }),
      options: DELIVERY_EVENTS.map((e) => ({ value: e, label: EVENT_LABEL[e] })),
    },
    {
      id: 'webhook',
      title: 'Webhook',
      value: one('webhookId'),
      onChange: (v) => set({ webhookId: v[0] }),
      options: (hooks.data ?? []).map((w) => ({ value: w.id, label: w.name })),
    },
  ];

  return (
    <>
      <DataTable
        id="deliveries"
        label="Webhook deliveries"
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
        onRowClick={(r) => set({ delivery: r.id }, false)}
        toolbar={{ filters, onReset }}
        empty={{ title: 'No deliveries match', description: 'Deliveries are kept for 30 days.' }}
      />
      <DrawerPreview
        open={!!open}
        onOpenChange={(o) => !o && set({ delivery: undefined }, false)}
        title={open ? EVENT_LABEL[open.event] : 'Delivery'}
        description={open ? `${nameOf(open.webhookId)} · ${formatDateTime(open.createdAt)}` : undefined}
        size="xl"
        footer={
          open &&
          canManage && (
            <Button onClick={() => void doRetry(open)} disabled={open.status === 'pending' || retry.isPending}>
              <RotateCwIcon />
              Retry delivery
            </Button>
          )
        }
      >
        {open && (
          <>
            <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge status={open.status} />
              </dd>
              <dt className="text-muted-foreground">Delivery id</dt>
              <dd className="font-mono text-xs">{open.id}</dd>
              <dt className="text-muted-foreground">Attempts</dt>
              <dd>{open.attempts} of 6</dd>
              <dt className="text-muted-foreground">Last answer</dt>
              <dd>{open.lastStatusCode ?? 'None yet'}</dd>
              {open.lastError && (
                <>
                  <dt className="text-muted-foreground">Last error</dt>
                  <dd className="text-destructive">{open.lastError}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Next attempt</dt>
              <dd>{open.nextAttemptAt ? formatDateTime(open.nextAttemptAt) : 'None'}</dd>
              <dt className="text-muted-foreground">Delivered</dt>
              <dd>{open.deliveredAt ? formatDateTime(open.deliveredAt) : 'Not yet'}</dd>
            </dl>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Payload</h3>
              <CopyButton value={JSON.stringify(open.payload, null, 2)} label="Copy JSON" />
            </div>
            <pre
              className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs"
              tabIndex={0}
              aria-label="Payload JSON"
            >
              {JSON.stringify(open.payload, null, 2)}
            </pre>
          </>
        )}
      </DrawerPreview>
    </>
  );
}
