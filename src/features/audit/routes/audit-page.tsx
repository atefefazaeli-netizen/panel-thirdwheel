import { getRouteApi } from '@tanstack/react-router';
import * as React from 'react';
import {
  columnHelper,
  CopyButton,
  DataTable,
  DrawerPreview,
  ForbiddenState,
  PageHeader,
  RoleGate,
} from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cleanSearch } from '@/lib/search';
import { useAudit, type AuditEntry } from '../api/audit-api';
import type { AuditSearch } from '../schemas/audit';

const route = getRouteApi('/_app/audit');

const h = columnHelper<AuditEntry>();
const columns = h.columns([
  h.accessor('at', {
    header: 'When',
    meta: { label: 'When' },
    cell: (c) => <span title={formatDateTime(c.getValue())}>{formatRelative(c.getValue())}</span>,
  }),
  h.accessor('actor', {
    header: 'Who',
    enableHiding: false,
    meta: { label: 'Who' },
    cell: (c) =>
      c.getValue().startsWith('apikey:') ? (
        <Badge variant="outline" className="font-mono">
          {c.getValue()}
        </Badge>
      ) : (
        <span className="flex flex-col">
          <span className="text-sm">{c.row.original.actorEmail ?? c.getValue()}</span>
          {c.row.original.actorEmail && (
            <span className="font-mono text-[11px] text-muted-foreground">{c.getValue()}</span>
          )}
        </span>
      ),
  }),
  h.accessor('action', {
    header: 'Action',
    meta: { label: 'Action' },
    cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
  }),
  h.accessor('target', {
    header: 'Target',
    meta: { label: 'Target', className: 'max-w-64' },
    cell: (c) => <span className="block truncate font-mono text-xs">{c.getValue()}</span>,
  }),
  h.accessor('meta', {
    header: 'Details',
    meta: { label: 'Details', className: 'max-w-72' },
    cell: (c) => (
      <span className="block truncate font-mono text-xs text-muted-foreground">
        {c.getValue() && Object.keys(c.getValue()!).length ? JSON.stringify(c.getValue()) : ''}
      </span>
    ),
  }),
]);

function TextFilter({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value?: string;
  onChange: (v?: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = React.useState(value ?? '');
  const [synced, setSynced] = React.useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(value ?? '');
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onChange(draft.trim() || undefined);
      }}
    >
      <Input
        aria-label={label}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onChange(draft.trim() || undefined)}
        className="h-8 w-44"
      />
    </form>
  );
}

export function AuditPage() {
  return (
    <RoleGate allow="admin" fallback={<ForbiddenState what="the audit log" />}>
      <Audit />
    </RoleGate>
  );
}

function Audit() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const page = search.page ?? 1;
  const limit = search.limit ?? 20;
  const { entry, ...q } = search;
  const list = useAudit({ ...q, page, limit });
  const open = list.data?.items.find((e) => e.id === entry) ?? null;
  const set = (patch: Partial<AuditSearch>, resetPage = true) =>
    navigate({
      search: (prev) => cleanSearch({ ...prev, ...(resetPage ? { page: undefined } : {}), ...patch }),
      replace: true,
    });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every admin, clinician and n8n write: who, what and on what. Details never include message text or secrets."
      />
      <DataTable
        id="audit"
        label="Audit log"
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
        onRowClick={(r) => set({ entry: r.id }, false)}
        toolbar={{
          extra: (
            <>
              <TextFilter
                label="Actor"
                value={search.actor}
                onChange={(actor) => set({ actor })}
                placeholder="Actor id or apikey:name"
              />
              <TextFilter
                label="Action"
                value={search.action}
                onChange={(action) => set({ action })}
                placeholder="Action (user.suspend)"
              />
              <TextFilter
                label="Target"
                value={search.target}
                onChange={(target) => set({ target })}
                placeholder="Target (user:…)"
              />
            </>
          ),
          onReset:
            search.actor || search.action || search.target
              ? () => void navigate({ search: {}, replace: true })
              : undefined,
        }}
        empty={{ title: 'No audit entries match', description: 'Try a shorter action, like content.' }}
      />
      <DrawerPreview
        open={!!open}
        onOpenChange={(o) => !o && set({ entry: undefined }, false)}
        title={open?.action ?? 'Entry'}
        description={open ? formatDateTime(open.at) : undefined}
      >
        {open && (
          <>
            <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Who</dt>
              <dd className="break-words">
                {open.actorEmail ?? open.actor}{' '}
                <span className="font-mono text-xs text-muted-foreground">{open.actor}</span>
              </dd>
              <dt className="text-muted-foreground">Action</dt>
              <dd className="font-mono text-xs">{open.action}</dd>
              <dt className="text-muted-foreground">Target</dt>
              <dd className="flex items-center gap-1 font-mono text-xs break-all">
                {open.target}
                <CopyButton value={open.target} iconOnly variant="ghost" label="Copy target" />
              </dd>
            </dl>
            <pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
              {JSON.stringify(open.meta ?? {}, null, 2)}
            </pre>
          </>
        )}
      </DrawerPreview>
    </>
  );
}
