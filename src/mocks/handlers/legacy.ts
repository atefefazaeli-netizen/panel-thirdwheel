// Existing legacy routes: catalog/items (public reads, admin writes), experiences (public reads,
// admin writes) and ideas/:id/booking-link (public read, admin writes).
import { http, HttpResponse } from 'msw';
import type { CatalogItem } from '@/features/legacy-catalog/api/types';
import { EXP_LABEL } from '../data/legacy';
import { db, recordAudit } from '../db';
import { guard } from '../session';
import { apiError, badRequest, p, paginate, readJson } from '../utils';

const SVG = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/;
const SLUG = /^[a-z0-9-]{2,40}$/;
const CARD = /^[a-z0-9][a-z0-9-]{0,39}$/;
const KINDS = ['book', 'guided', 'home', 'place'];
const EXPS = Object.keys(EXP_LABEL);

/** PATCH: sent fields replace, null clears an optional field (IsOptional lets null through). */
function mergePatch(target: object, patch: Record<string, unknown>) {
  const t = target as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete t[k];
    else t[k] = v;
  }
}

const publicItem = ({ tags: _t, refPrefix: _r, ...rest }: CatalogItem) => rest;

function itemProblems(b: Partial<CatalogItem>, partial: boolean): string | null {
  const need = (k: keyof CatalogItem) => !partial || b[k] !== undefined;
  if (need('title') && (typeof b.title !== 'string' || !b.title || b.title.length > 120))
    return 'title must be shorter than or equal to 120 characters';
  if (need('where') && b.where !== 'home' && b.where !== 'out')
    return 'where must be one of the following values: home, out';
  if (need('usd') && (!Number.isInteger(b.usd) || (b.usd as number) < 0)) return 'usd must not be less than 0';
  if (need('reason') && (typeof b.reason !== 'string' || b.reason.length > 300))
    return 'reason must be shorter than or equal to 300 characters';
  if (need('meta') && (typeof b.meta !== 'string' || b.meta.length > 200))
    return 'meta must be shorter than or equal to 200 characters';
  if (need('kind') && !KINDS.includes(b.kind as string))
    return 'kind must be one of the following values: book, guided, home, place';
  if (need('d') && (typeof b.d !== 'string' || b.d.length > 600 || !SVG.test(b.d))) return 'd must be SVG path data';
  if (
    b.tags !== undefined &&
    (!Array.isArray(b.tags) || b.tags.length > 20 || b.tags.some((t) => !/^[a-z-]{2,24}$/.test(t)))
  )
    return 'each value in tags must match /^[a-z-]{2,24}$/';
  return null;
}

/** Active ideas matching the list filters, sorted by id (as the API). */
function listItems(url: URL) {
  const q = url.searchParams;
  const max = q.get('maxUsd') ? Number(q.get('maxUsd')) : null;
  const s = db().legacy;
  return s.items
    .filter(
      (i) =>
        !s.retired.has(i.id) &&
        (!q.get('where') || i.where === q.get('where')) &&
        (!q.get('kind') || i.kind === q.get('kind')) &&
        (max === null || i.usd <= max),
    )
    .sort((a, b) => a.id - b.id);
}

export const legacyHandlers = [
  http.get(p('catalog/items'), ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(paginate(listItems(url).map(publicItem), url));
  }),

  // Admin list: tags and refPrefix included.
  http.get(p('catalog/admin/items'), ({ request }) =>
    guard(request, 'admin', () => {
      const url = new URL(request.url);
      return HttpResponse.json(paginate(listItems(url), url));
    }),
  ),

  http.post(p('catalog/items'), ({ request }) =>
    guard(request, 'admin', async (me) => {
      const b = await readJson<Partial<CatalogItem>>(request);
      if (b.id !== undefined && (!Number.isInteger(b.id) || b.id < 1 || b.id > 1_000_000))
        return badRequest('id must not be less than 1');
      const bad = itemProblems(b, false);
      if (bad) return badRequest(bad);
      // Without an id: the next one after every id ever used (retired ideas keep theirs).
      const id = b.id ?? Math.max(0, ...db().legacy.items.map((i) => i.id)) + 1;
      if (db().legacy.items.some((i) => i.id === id))
        return apiError(
          409,
          'An idea with this id already exists (retired ideas keep their id)',
          'CATALOG_ITEM_EXISTS',
        );
      const item = { tags: [], refPrefix: 'TW', ...b, id } as CatalogItem;
      db().legacy.items.push(item);
      recordAudit(me, 'catalog.item.create', `catalog_item:${item.id}`);
      return HttpResponse.json(item, { status: 201 });
    }),
  ),

  http.patch(p('catalog/items/:id'), ({ request, params }) =>
    guard(request, 'admin', async (me) => {
      const item = db().legacy.items.find((i) => i.id === Number(params.id) && !db().legacy.retired.has(i.id));
      if (!item) return apiError(404, 'Idea not found', 'CATALOG_ITEM_NOT_FOUND');
      const { id: _ignored, ...patch } = await readJson<Partial<CatalogItem>>(request);
      const bad = itemProblems(patch, true);
      if (bad) return badRequest(bad);
      mergePatch(item, patch);
      recordAudit(me, 'catalog.item.update', `catalog_item:${item.id}`, { fields: Object.keys(patch).sort() });
      return HttpResponse.json(item);
    }),
  ),

  http.delete(p('catalog/items/:id'), ({ request, params }) =>
    guard(request, 'admin', (me) => {
      const id = Number(params.id);
      if (!db().legacy.items.some((i) => i.id === id) || db().legacy.retired.has(id))
        return apiError(404, 'Idea not found', 'CATALOG_ITEM_NOT_FOUND');
      db().legacy.retired.add(id);
      recordAudit(me, 'catalog.item.retire', `catalog_item:${id}`);
      return new HttpResponse(null, { status: 204 });
    }),
  ),

  http.get(p('experiences/meta'), () => HttpResponse.json({ filters: EXPS, labels: EXP_LABEL })),

  http.get(p('experiences'), ({ request }) => {
    const url = new URL(request.url);
    const exp = url.searchParams.get('exp')?.split(',').filter(Boolean) ?? [];
    const s = db().legacy;
    return HttpResponse.json(
      paginate(
        s.experiences.filter((x) => !s.retiredXp.has(x.id) && (!exp.length || exp.includes(x.exp))),
        url,
      ),
    );
  }),

  http.post(p('experiences'), ({ request }) =>
    guard(request, 'admin', async (me) => {
      const b = await readJson<Record<string, unknown>>(request);
      if (typeof b.id !== 'string' || !SLUG.test(b.id)) return badRequest('id must match /^[a-z0-9-]{2,40}$/');
      if (!EXPS.includes(b.exp as string))
        return badRequest('exp must be one of the following values: ' + EXPS.join(', '));
      if (typeof b.title !== 'string' || b.title.length > 140)
        return badRequest('title must be shorter than or equal to 140 characters');
      if (db().legacy.experiences.some((x) => x.id === b.id))
        return apiError(409, 'Experience exists already', 'EXPERIENCE_EXISTS');
      db().legacy.experiences.push(b as never);
      recordAudit(me, 'experience.create', `experience:${b.id as string}`);
      return HttpResponse.json(b, { status: 201 });
    }),
  ),

  http.patch(p('experiences/:id'), ({ request, params }) =>
    guard(request, 'admin', async (me) => {
      const x = db().legacy.experiences.find((e) => e.id === params.id && !db().legacy.retiredXp.has(e.id));
      if (!x) return apiError(404, 'Experience not found', 'EXPERIENCE_NOT_FOUND');
      const { id: _ignored, ...patch } = await readJson<Record<string, unknown>>(request);
      if (patch.exp !== undefined && !EXPS.includes(patch.exp as string))
        return badRequest('exp must be one of the following values: ' + EXPS.join(', '));
      mergePatch(x, patch);
      recordAudit(me, 'experience.update', `experience:${x.id}`, { fields: Object.keys(patch).sort() });
      return HttpResponse.json(x);
    }),
  ),

  http.delete(p('experiences/:id'), ({ request, params }) =>
    guard(request, 'admin', (me) => {
      if (!db().legacy.experiences.some((x) => x.id === params.id) || db().legacy.retiredXp.has(String(params.id)))
        return apiError(404, 'Experience not found', 'EXPERIENCE_NOT_FOUND');
      db().legacy.retiredXp.add(String(params.id));
      recordAudit(me, 'experience.retire', `experience:${String(params.id)}`);
      return new HttpResponse(null, { status: 204 });
    }),
  ),

  http.get(p('ideas/:id/booking-link'), ({ request, params }) =>
    guard(request, 'user', () => {
      const id = String(params.id);
      if (!CARD.test(id)) return badRequest('id must match /^[a-z0-9][a-z0-9-]{0,39}$/');
      const link = db().legacy.links.get(id);
      const title = db().content.items.get(id)?.live?.catalog.title ?? id.replace(/-/g, ' ');
      return HttpResponse.json(
        link ?? {
          url: `https://www.google.com/search?q=${encodeURIComponent(String(title))}`,
          paidLink: false,
          venue: null,
          source: 'search',
        },
      );
    }),
  ),

  http.put(p('ideas/:id/booking-link'), ({ request, params }) =>
    guard(request, 'admin', async (me) => {
      const id = String(params.id);
      const b = await readJson<{ url?: string; venue?: string | null; paid?: boolean }>(request);
      const ok = (() => {
        try {
          return new URL(b.url ?? '').protocol === 'https:';
        } catch {
          return false;
        }
      })();
      if (!ok || (b.url ?? '').length > 2000) return badRequest('url must be a URL address');
      if (typeof b.paid !== 'boolean') return badRequest('paid must be a boolean value');
      const link = { url: b.url!, paidLink: b.paid, venue: b.venue ?? null, source: 'venue' as const };
      db().legacy.links.set(id, link);
      recordAudit(me, 'booking_link.set', `booking_link:${id}`, {
        host: new URL(b.url!).host,
        paid: b.paid,
        venue: b.venue ?? null,
      });
      return HttpResponse.json(link);
    }),
  ),

  http.delete(p('ideas/:id/booking-link'), ({ request, params }) =>
    guard(request, 'admin', (me) => {
      if (!db().legacy.links.delete(String(params.id)))
        return apiError(404, 'No venue page for this card', 'BOOKING_LINK_NOT_FOUND');
      recordAudit(me, 'booking_link.remove', `booking_link:${String(params.id)}`);
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];
