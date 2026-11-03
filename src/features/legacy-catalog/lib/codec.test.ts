import { describe, expect, it } from 'vitest';
import items from '@/mocks/data/catalog-seed.json';
import xps from '@/mocks/data/experiences-seed.json';
import type { CatalogItem, Experience } from '../api/types';
import { catalogItemSchema, experienceSchema } from '../schemas/legacy';
import { formToItem, formToXp, itemToForm, xpToForm } from './codec';

describe('legacy codecs', () => {
  it('round-trips every seeded date idea through the form', () => {
    for (const i of items as CatalogItem[]) {
      const form = itemToForm(i, 0);
      expect(catalogItemSchema.safeParse(form).success, String(i.id)).toBe(true);
      const { src: _s, srcName: _n, link: _l, area: _a, ...editable } = i;
      expect(formToItem(form)).toEqual(editable);
    }
  });

  it('round-trips every seeded experience through the form', () => {
    for (const x of xps as Experience[]) {
      const form = xpToForm(x);
      expect(experienceSchema.safeParse(form).success, x.id).toBe(true);
      expect(formToXp(form)).toEqual(x);
    }
  });

  it('rejects icon paths that are not SVG path data and bad weights', () => {
    expect(
      catalogItemSchema.safeParse({ ...itemToForm(null, 99), title: 'x', reason: 'r', meta: 'm', d: '<script>' })
        .success,
    ).toBe(false);
    const f = { ...xpToForm(null), id: 'x-test', title: 't', meta: 'm', reason: 'r', pText: '{"talk":"lots"}' };
    expect(experienceSchema.safeParse(f).success).toBe(false);
    expect(experienceSchema.safeParse({ ...f, pText: '{"talk":3}', cmdText: '{"mode":"vent"}' }).success).toBe(false);
    expect(experienceSchema.safeParse({ ...f, pText: '{"talk":3}', cmdText: '{"screen":"chat"}' }).success).toBe(true);
  });
});
