// Shared API shapes. Pagination follows libs/common/src Paginated / paginate in the backend:
// `{ items, meta: { page, limit, total, totalPages } }` (ADMIN_API.md says to copy those names).

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export interface PageQuery {
  page?: number;
  limit?: number;
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export const emptyPage = <T>(limit = 20): Paginated<T> => ({
  items: [],
  meta: { page: 1, limit, total: 0, totalPages: 1 },
});
