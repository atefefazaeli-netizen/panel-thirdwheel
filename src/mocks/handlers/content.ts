// ADMIN_API.md › Content: panel routes (read: admin or clinician; writes as noted) and the app's
// manifest / published routes. Rules come from ../content-domain (a port of the backend domain).
import { http, HttpResponse } from 'msw';
import type { ContentImportResult, ContentSummary } from '@/features/content/api/types';
import type { StaffUser } from '@/stores/session';
import {
  approveDraft,
  ContentRuleError,
  createItem,
  currentSnapshot,
  discardDraft,
  importDraft,
  requestChanges,
  restoreItem,
  rollbackTo,
  saveDraft,
  submitDraft,
  unpublishItem,
  type Actor,
  type StoredItem,
  type Transition,
} from '../content-domain';
import { db, recordAudit } from '../db';
import { emitMockEvent } from '../events';
import { guard } from '../session';
import { apiError, badRequest, nowIso, p, paginate, readJson } from '../utils';

const actorOf = (me: StaffUser): Actor => ({ id: me.userId, email: me.email, roles: me.roles });
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

function summary(i: StoredItem): ContentSummary {
  const c = currentSnapshot(i)?.catalog;
  return {
    id: i.id,
    code: i.code,
    pillar: i.pillar,
    kind: i.kind,
    title: str(c?.title) ?? i.id,
    category: str(c?.category),
    type: str(c?.type),
    only: str(c?.only),
    liveVersion: i.liveVersion,
    draftState: i.draft?.state ?? null,
    retired: i.retired,
    updatedAt: i.updatedAt,
  };
}

/** The API view: the stored item without the server-only revision field. */
const view = ({ liveRevision: _r, ...rest }: StoredItem) => rest;

function ruleError(e: unknown) {
  if (e instanceof ContentRuleError)
    return apiError(e.status, e.message, e.code, e.details ? { details: e.details } : {});
  throw e;
}

function find(id: string | readonly string[] | undefined) {
  return db().content.items.get(String(id));
}

/** Applies a transition: store it, log it, publish when live changed, audit the write. */
function commit(me: StaffUser, action: string, t: Transition, meta: Record<string, unknown> = {}) {
  const c = db().content;
  let item = t.item;
  if (t.publishes) {
    c.revision += 1;
    item = { ...item, liveRevision: c.revision };
    const title = str(item.live?.catalog.title) ?? item.id;
    emitMockEvent('content.published', {
      itemId: item.id,
      code: item.code,
      pillar: item.pillar,
      title,
      version: item.liveVersion,
      action: t.publishes,
      by: me.userId,
      at: item.updatedAt,
    });
  }
  c.items.set(item.id, item);
  c.changes.push({ ...t.change, itemId: item.id });
  if (t.version) c.versions.push(t.version);
  recordAudit(me, action, `content:${item.id}`, meta);
  return HttpResponse.json(view(item));
}

function step(
  request: Request,
  need: 'admin' | 'clinician',
  action: string,
  fn: (item: StoredItem, me: StaffUser, body: Record<string, unknown>) => Transition,
  id: string,
) {
  return guard(request, need, async (me) => {
    const item = find(id);
    if (!item) return apiError(404, 'Content not found', 'CONTENT_NOT_FOUND');
    const body = await readJson(request);
    try {
      return commit(me, action, fn(item, me, body));
    } catch (e) {
      return ruleError(e);
    }
  });
}

const note = (b: Record<string, unknown>) => (typeof b.note === 'string' ? b.note : null);

export const contentHandlers = [
  http.get(p('admin/content'), ({ request }) =>
    guard(request, 'staff', () => {
      const url = new URL(request.url);
      const q = url.searchParams;
      const term = (q.get('q') ?? '').trim().toLowerCase().slice(0, 80);
      const state = q.get('state');
      const rows = [...db().content.items.values()]
        .filter((i) => {
          const s = summary(i);
          if (q.get('pillar') && i.pillar !== q.get('pillar')) return false;
          if (q.get('category') && s.category !== q.get('category')) return false;
          if (q.get('type') && s.type !== q.get('type')) return false;
          if (q.get('only') && s.only !== q.get('only')) return false;
          if (state === 'retired' && !i.retired) return false;
          if (state === 'live' && (i.retired || i.liveVersion === 0)) return false;
          if (state && state !== 'retired' && state !== 'live' && (i.retired || i.draft?.state !== state)) return false;
          if (
            term &&
            !(
              s.title.toLowerCase().includes(term) ||
              i.id.includes(term) ||
              (i.code ?? '').toLowerCase().includes(term)
            )
          )
            return false;
          return true;
        })
        .sort(
          (a, b) =>
            a.pillar.localeCompare(b.pillar) || (a.code ?? '').localeCompare(b.code ?? '') || a.id.localeCompare(b.id),
        )
        .map(summary);
      return HttpResponse.json(paginate(rows, url));
    }),
  ),

  http.get(p('admin/content/facets'), ({ request }) =>
    guard(request, 'staff', () => {
      const rows = [...db().content.items.values()].map(summary);
      const set = (k: 'category' | 'type' | 'kind') =>
        [...new Set(rows.map((r) => r[k]).filter((x): x is string => !!x))].sort();
      return HttpResponse.json({ categories: set('category'), types: set('type'), kinds: set('kind') });
    }),
  ),

  http.post(p('admin/content/import'), ({ request }) =>
    guard(request, 'admin', async (me) => {
      const body = await readJson<{ items?: unknown; note?: string }>(request);
      if (!Array.isArray(body.items)) return badRequest('items must be an array');
      if (body.items.length > 200) return apiError(400, 'At most 200 items in one import.', 'INVALID_CONTENT');
      const out: ContentImportResult = { created: [], updated: [], rejected: [] };
      const seen = new Set<string>();
      const c = db().content;
      for (const input of body.items as Record<string, unknown>[]) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
          out.rejected.push({ id: '', reason: 'Not an item' });
          continue;
        }
        const id = typeof input.id === 'string' ? input.id : '';
        if (seen.has(id)) {
          out.rejected.push({ id, reason: 'Listed twice in this import' });
          continue;
        }
        seen.add(id);
        try {
          const existing = c.items.get(id) ?? null;
          const t = importDraft(
            existing,
            input as Parameters<typeof importDraft>[1],
            body.note,
            actorOf(me),
            nowIso(),
            'panel',
          );
          c.items.set(id, t.item);
          c.changes.push({ ...t.change, itemId: id });
          (existing ? out.updated : out.created).push(id);
        } catch (e) {
          if (!(e instanceof ContentRuleError)) throw e;
          out.rejected.push({ id, reason: e.details?.length ? `${e.message} ${e.details.join('; ')}` : e.message });
        }
      }
      recordAudit(me, 'content.import', 'content:import', {
        created: out.created.length,
        updated: out.updated.length,
        rejected: out.rejected.length,
        source: 'panel',
      });
      return HttpResponse.json(out);
    }),
  ),

  http.get(p('admin/content/:id'), ({ request, params }) =>
    guard(request, 'staff', () => {
      const item = find(params.id);
      return item ? HttpResponse.json(view(item)) : apiError(404, 'Content not found', 'CONTENT_NOT_FOUND');
    }),
  ),

  http.post(p('admin/content'), ({ request }) =>
    guard(request, 'admin', async (me) => {
      const body = await readJson<{
        id?: string;
        code?: string | null;
        pillar?: string;
        kind?: string;
        snapshot?: unknown;
      }>(request);
      if (body.id && find(body.id)) return apiError(409, `${body.id} exists already.`, 'CONTENT_EXISTS');
      try {
        const t = createItem(
          {
            id: body.id ?? '',
            code: body.code ?? null,
            pillar: body.pillar as StoredItem['pillar'],
            kind: body.kind ?? '',
            snapshot: body.snapshot,
          },
          actorOf(me),
          nowIso(),
        );
        const res = commit(me, 'content.create', t);
        return new HttpResponse(res.body, { status: 201, headers: res.headers });
      } catch (e) {
        return ruleError(e);
      }
    }),
  ),

  http.put(p('admin/content/:id/draft'), ({ request, params }) =>
    step(
      request,
      'admin',
      'content.draft_save',
      (i, me, b) => saveDraft(i, b.snapshot, actorOf(me), nowIso()),
      String(params.id),
    ),
  ),
  http.delete(p('admin/content/:id/draft'), ({ request, params }) =>
    step(
      request,
      'admin',
      'content.draft_discard',
      (i, me) => discardDraft(i, actorOf(me), nowIso()),
      String(params.id),
    ),
  ),
  http.post(p('admin/content/:id/submit'), ({ request, params }) =>
    step(
      request,
      'admin',
      'content.submit',
      (i, me, b) => submitDraft(i, note(b), actorOf(me), nowIso()),
      String(params.id),
    ),
  ),
  http.post(p('admin/content/:id/approve'), ({ request, params }) =>
    step(
      request,
      'clinician',
      'content.approve',
      (i, me, b) => approveDraft(i, note(b), actorOf(me), nowIso()),
      String(params.id),
    ),
  ),
  http.post(p('admin/content/:id/request-changes'), ({ request, params }) =>
    step(
      request,
      'clinician',
      'content.request_changes',
      (i, me, b) => requestChanges(i, note(b), actorOf(me), nowIso()),
      String(params.id),
    ),
  ),
  http.post(p('admin/content/:id/unpublish'), ({ request, params }) =>
    step(request, 'admin', 'content.unpublish', (i, me) => unpublishItem(i, actorOf(me), nowIso()), String(params.id)),
  ),
  http.post(p('admin/content/:id/restore'), ({ request, params }) =>
    step(request, 'admin', 'content.restore', (i, me) => restoreItem(i, actorOf(me), nowIso()), String(params.id)),
  ),

  http.get(p('admin/content/:id/versions'), ({ request, params }) =>
    guard(request, 'staff', () => {
      if (!find(params.id)) return apiError(404, 'Content not found', 'CONTENT_NOT_FOUND');
      const rows = db()
        .content.versions.filter((v) => v.itemId === params.id)
        .sort((a, b) => b.version - a.version)
        .map(({ itemId: _i, snapshot: _s, ...v }) => v);
      return HttpResponse.json(rows);
    }),
  ),

  http.get(p('admin/content/:id/versions/:version'), ({ request, params }) =>
    guard(request, 'staff', () => {
      const v = db().content.versions.find((x) => x.itemId === params.id && x.version === Number(params.version));
      if (!v) return apiError(404, 'No such version.', 'VERSION_NOT_FOUND');
      const { itemId: _i, ...rest } = v;
      return HttpResponse.json(rest);
    }),
  ),

  http.post(p('admin/content/:id/rollback'), ({ request, params }) =>
    step(
      request,
      'admin',
      'content.rollback',
      (i, me, b) => {
        const target = db().content.versions.find((x) => x.itemId === i.id && x.version === Number(b.version));
        if (!target) throw new ContentRuleError('VERSION_NOT_FOUND', 'No such version.', 404);
        return rollbackTo(i, target, note(b), actorOf(me), nowIso());
      },
      String(params.id),
    ),
  ),

  http.get(p('admin/content/:id/changes'), ({ request, params }) =>
    guard(request, 'staff', () => {
      if (!find(params.id)) return apiError(404, 'Content not found', 'CONTENT_NOT_FOUND');
      const rows = db()
        .content.changes.filter((c) => c.itemId === params.id)
        .map(({ itemId: _i, ...c }) => c)
        .sort((a, b) => b.at.localeCompare(a.at));
      return HttpResponse.json(paginate(rows, new URL(request.url)));
    }),
  ),

  // App routes (the panel does not call them; here so the mock covers the whole contract).
  http.get(p('content/manifest'), ({ request }) =>
    guard(request, 'user', () => HttpResponse.json({ revision: db().content.revision, updatedAt: nowIso() })),
  ),
  http.get(p('content/published'), ({ request }) =>
    guard(request, 'user', () => {
      const since = Number(new URL(request.url).searchParams.get('since') ?? 0);
      const changed = [...db().content.items.values()].filter((i) => i.liveRevision > since);
      const items = changed
        .filter((i) => i.live && !i.retired)
        .map((i) => ({
          id: i.id,
          code: i.code,
          pillar: i.pillar,
          kind: i.kind,
          version: i.liveVersion,
          catalog: i.live!.catalog,
          body: i.live!.body,
          publishedAt: i.livePublishedAt ?? i.updatedAt,
        }));
      return HttpResponse.json({
        revision: db().content.revision,
        items,
        retired: changed.filter((i) => i.retired).map((i) => i.id),
      });
    }),
  ),
];
