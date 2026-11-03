// Helpers shared by the mock handlers. Mocks follow backend/docs/ADMIN_API.md exactly: same
// paths, bodies, status codes and error codes, so contract drift shows up when the panel is
// pointed at the real API.
import { HttpResponse } from 'msw';
import { apiUrl } from '@/lib/api/client';
import type { Paginated } from '@/lib/api/types';

/** Absolute URL pattern for an API path (`admin/users/:id`). */
export const p = (path: string): string => apiUrl(path).replace(/%3A/gi, ':');

let seq = 0;
export const mockId = (prefix = ''): string => {
  seq += 1;
  return `${prefix}${Date.now().toString(16).slice(-6)}${seq.toString(16).padStart(6, '0')}`;
};
export const randomToken = (n = 24): string => {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < n; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
};

export const nowIso = (): string => new Date().toISOString();
export const daysAgo = (d: number, h = 0): string =>
  new Date(Date.now() - d * 86_400_000 - h * 3_600_000).toISOString();

export function apiError(status: number, message: string, code?: string, extra: Record<string, unknown> = {}) {
  return HttpResponse.json(
    { statusCode: status, message, ...(code ? { code } : {}), requestId: `mock-${randomToken(8)}`, ...extra },
    { status },
  );
}

export const notFound = (what = 'Not found') => apiError(404, what, 'NOT_FOUND');
export const badRequest = (message: string, code = 'VALIDATION_FAILED', extra: Record<string, unknown> = {}) =>
  apiError(400, message, code, extra);

/** `page` (1-based) and `limit` (≤100) from the query, like PaginationQueryDto. */
export function pageParams(url: URL): { page: number; limit: number } {
  const page = Math.max(1, Math.floor(Number(url.searchParams.get('page') ?? 1)) || 1);
  const limit = Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get('limit') ?? 20)) || 20));
  return { page, limit };
}

export function paginate<T>(all: T[], url: URL): Paginated<T> {
  const { page, limit } = pageParams(url);
  const start = (page - 1) * limit;
  return {
    items: all.slice(start, start + limit),
    meta: { page, limit, total: all.length, totalPages: Math.max(1, Math.ceil(all.length / limit)) },
  };
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    const text = await request.text();
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    return {} as T;
  }
}

export const byNewest =
  <T extends Record<K, string | null>, K extends keyof T>(key: K) =>
  (a: T, b: T) =>
    String(b[key] ?? '').localeCompare(String(a[key] ?? ''));

export const clone = <T>(v: T): T => structuredClone(v);
