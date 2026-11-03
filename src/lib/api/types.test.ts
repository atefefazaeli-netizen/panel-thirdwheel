import { describe, expect, it } from 'vitest';
import { normalizePage } from './types';

describe('normalizePage', () => {
  it('keeps the backend Paginated shape', () => {
    const p = normalizePage({ items: [1, 2], meta: { page: 2, limit: 2, total: 9, totalPages: 5 } });
    expect(p.meta).toEqual({ page: 2, limit: 2, total: 9, totalPages: 5 });
  });

  it('maps the flat shape from the contract intro', () => {
    const p = normalizePage({ items: ['a'], total: 41, page: 3, limit: 20, pages: 3 });
    expect(p).toEqual({ items: ['a'], meta: { page: 3, limit: 20, total: 41, totalPages: 3 } });
  });

  it('tolerates a bare array', () => {
    expect(normalizePage([1, 2, 3]).meta.total).toBe(3);
  });
});
