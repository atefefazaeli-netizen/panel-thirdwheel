import {
  useTable,
  type ColumnVisibilityState,
  type RowData,
  type RowSelectionState,
  type Updater,
} from '@tanstack/react-table';
import { XIcon } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { EmptyState } from '../empty-state';
import { ErrorState } from '../error-state';
import { DataTablePagination } from './data-table-pagination';
import { DataTableToolbar, type DataTableToolbarProps } from './data-table-toolbar';
import { DataTableViewOptions } from './data-table-view-options';
import { dataTableFeatures, type DataTableColumn } from './features';

export interface DataTableProps<TData extends RowData> {
  /** Accessible name of the table. */
  label: string;
  /** Stable key used to remember column visibility in this browser. */
  id?: string;
  columns: DataTableColumn<TData>[];
  data: TData[] | undefined;
  getRowId: (row: TData) => string;

  /** Server pagination, 1-based like the API. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;

  loading?: boolean;
  /** A background refetch is running (keeps rows visible, dims them). */
  fetching?: boolean;
  error?: unknown;
  onRetry?: () => void;

  toolbar?: Omit<DataTableToolbarProps, 'viewOptions'>;
  /** Shows checkboxes; batch actions receive the selected ids (across pages) and loaded rows. */
  selectable?: boolean;
  batchActions?: (ctx: { ids: string[]; rows: TData[]; clear: () => void }) => React.ReactNode;

  onRowClick?: (row: TData) => void;
  empty?: { title: string; description?: string; action?: React.ReactNode };
  initialColumnVisibility?: ColumnVisibilityState;
  className?: string;
}

const EMPTY: never[] = [];

function readVisibility(id: string | undefined, fallback: ColumnVisibilityState): ColumnVisibilityState {
  if (!id) return fallback;
  try {
    const raw = localStorage.getItem(`tw-panel-cols:${id}`);
    return raw ? { ...fallback, ...(JSON.parse(raw) as ColumnVisibilityState) } : fallback;
  } catch {
    return fallback;
  }
}

function apply<T>(updater: Updater<T>, old: T): T {
  return typeof updater === 'function' ? (updater as (o: T) => T)(old) : updater;
}

export function DataTable<TData extends RowData>({
  label,
  id,
  columns: userColumns,
  data,
  getRowId,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  loading,
  fetching,
  error,
  onRetry,
  toolbar,
  selectable,
  batchActions,
  onRowClick,
  empty,
  initialColumnVisibility = {},
  className,
}: DataTableProps<TData>) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>(() =>
    readVisibility(id, initialColumnVisibility),
  );

  const onVisibilityChange = React.useCallback(
    (updater: Updater<ColumnVisibilityState>) => {
      setColumnVisibility((old) => {
        const next = apply(updater, old);
        if (id) {
          try {
            localStorage.setItem(`tw-panel-cols:${id}`, JSON.stringify(next));
          } catch {
            // Per-browser convenience only.
          }
        }
        return next;
      });
    },
    [id],
  );

  const columns = React.useMemo<DataTableColumn<TData>[]>(() => {
    if (!selectable) return userColumns;
    const select: DataTableColumn<TData> = {
      id: 'select',
      enableHiding: false,
      meta: { className: 'w-10' },
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all rows on this page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onClick={(e) => {
            e.stopPropagation();
            row.getToggleSelectedHandler()(e);
          }}
          aria-label="Select row"
        />
      ),
    };
    return [select, ...userColumns];
  }, [selectable, userColumns]);

  const pagination = React.useMemo(() => ({ pageIndex: Math.max(0, page - 1), pageSize }), [page, pageSize]);

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: data ?? (EMPTY as TData[]),
    getRowId: (row: TData) => getRowId(row),
    manualPagination: true,
    rowCount: total,
    enableRowSelection: !!selectable,
    state: { rowSelection, columnVisibility, pagination },
    onRowSelectionChange: (u: Updater<RowSelectionState>) => setRowSelection((old) => apply(u, old)),
    onColumnVisibilityChange: onVisibilityChange,
    onPaginationChange: (u) => {
      const next = apply(u, pagination);
      if (next.pageSize !== pageSize) onPageSizeChange(next.pageSize);
      else if (next.pageIndex !== pagination.pageIndex) onPageChange(next.pageIndex + 1);
    },
  });

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const selectedRows = (data ?? []).filter((r) => rowSelection[getRowId(r)]);
  const clear = () => setRowSelection({});
  const visibleColumns = table.getVisibleLeafColumns().length;
  const rows = table.getRowModel().rows;

  let body: React.ReactNode;
  if (error && !data) {
    body = (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={visibleColumns} className="p-0">
          <ErrorState error={error} onRetry={onRetry} className="border-0 shadow-none" />
        </TableCell>
      </TableRow>
    );
  } else if (loading && !data) {
    body = Array.from({ length: Math.min(pageSize, 8) }).map((_, i) => (
      <TableRow key={`sk-${i}`} className="hover:bg-transparent">
        {table.getVisibleLeafColumns().map((c) => (
          <TableCell key={c.id}>
            <Skeleton className="h-4 w-full max-w-40" />
          </TableCell>
        ))}
      </TableRow>
    ));
  } else if (rows.length === 0) {
    body = (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={visibleColumns} className="p-0">
          <EmptyState
            title={empty?.title ?? 'Nothing here yet'}
            description={empty?.description ?? 'Try another search or clear the filters.'}
            action={empty?.action}
            className="border-0"
          />
        </TableCell>
      </TableRow>
    );
  } else {
    body = rows.map((row) => (
      <TableRow
        key={row.id}
        data-state={row.getIsSelected() ? 'selected' : undefined}
        className={cn(onRowClick && 'cursor-pointer')}
        onClick={onRowClick ? () => onRowClick(row.original) : undefined}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
            <table.FlexRender cell={cell} />
          </TableCell>
        ))}
      </TableRow>
    ));
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {toolbar && (
        <DataTableToolbar {...toolbar} viewOptions={<DataTableViewOptions columns={table.getAllLeafColumns()} />} />
      )}
      {selectable && selectedIds.length > 0 && batchActions && (
        <div
          role="region"
          aria-label="Batch actions"
          className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/60 px-3 py-2"
        >
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          {batchActions({ ids: selectedIds, rows: selectedRows, clear })}
          <Button variant="ghost" size="sm" className="ml-auto h-8" onClick={clear}>
            <XIcon />
            Clear selection
          </Button>
        </div>
      )}
      <div
        className={cn('overflow-hidden rounded-md border bg-card transition-opacity', fetching && data && 'opacity-70')}
        aria-busy={loading || fetching || undefined}
      >
        <Table aria-label={label}>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => (
                  <TableHead key={header.id} className={header.column.columnDef.meta?.className}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>{body}</TableBody>
        </Table>
      </div>
      <DataTablePagination
        page={page}
        pageSize={pageSize}
        total={total}
        selected={selectable ? selectedIds.length : 0}
        onPageChange={(p) => table.setPageIndex(p - 1)}
        onPageSizeChange={(s) => table.setPageSize(s)}
      />
    </div>
  );
}
