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

/**
 * Accepts both page shapes the contract mentions: the backend's `Paginated` (`{ items, meta }`,
 * what libs/common returns) and the flat `{ items, total, page, limit, pages }` the ADMIN_API.md
 * intro names. Lists keep working whichever one a module ships.
 */
export function normalizePage<T>(raw: unknown): Paginated<T> {
  const r = (raw ?? {}) as Partial<Paginated<T>> & { total?: number; page?: number; limit?: number; pages?: number };
  const items = Array.isArray(r.items) ? r.items : Array.isArray(raw) ? (raw as T[]) : [];
  if (r.meta) return { items, meta: r.meta };
  const limit = r.limit ?? (items.length || 20);
  const total = r.total ?? items.length;
  return {
    items,
    meta: { page: r.page ?? 1, limit, total, totalPages: r.pages ?? Math.max(1, Math.ceil(total / limit)) },
  };
}
