// The TanStack Table v9 feature set every panel table uses. Tables are server-driven: the API
// pages, searches and filters; the table renders one page and owns selection and visibility.
import {
  columnVisibilityFeature,
  createColumnHelper,
  metaHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  tableFeatures,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';

export interface DataTableColumnMeta {
  /** Name in the column visibility menu (defaults to the column id). */
  label?: string;
  /** Extra classes for the header and cells (width, alignment). */
  className?: string;
}

export const dataTableFeatures = tableFeatures({
  rowSelectionFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableFeatures = typeof dataTableFeatures;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData, any>;

/** Column helper bound to the panel's table features. */
export const columnHelper = <TData extends RowData>() => createColumnHelper<DataTableFeatures, TData>();

export const PAGE_SIZES = [10, 20, 50, 100] as const;
