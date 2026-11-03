// ADMIN_API.md › Safety: the app's signal route and the panel routes (admin or clinician).
import { http, HttpResponse } from 'msw';
import type { SafetyFlag, SafetyKind } from '@/features/safety/api/types';
import { LEVEL_OF } from '../data/safety';
import { db, recordAudit } from '../db';
import { emitMockEvent } from '../events';
import { guard } from '../session';
import { apiError, badRequest, mockId, nowIso, p, paginate, readJson } from '../utils';

const KINDS = ['crisis', 'safety', 'heat'];
const APP_SURFACES = ['third-ear', 'quiz', 'answer', 'other'];
const FOLD_MS = 10 * 60_000;

const find = (id: unknown) => db().safety.flags.find((f) => f.id === String(id));
const notFound = () => apiError(404, 'No safety flag with that id', 'FLAG_NOT_FOUND');

function alert(f: SafetyFlag, escalation?: { by: string; note: string | null }) {
  emitMockEvent('crisis.alert', {
    flagId: f.id,
    userId: f.userId,
    kind: f.kind,
    level: f.level,
    surface: f.surface,
    helplineShown: f.helplineShown,
    count: f.count,
    at: nowIso(),
    escalated: !!escalation,
    escalatedBy: escalation?.by ?? null,
    note: escalation?.note ?? null,
    panelUrl: `${window.location.origin}/safety/${f.id}`,
  });
}

export const safetyHandlers = [
  http.post(p('safety/signals'), ({ request }) =>
    guard(request, 'user', async (me) => {
      const body = await readJson<Record<string, unknown>>(request);
      const extra = Object.keys(body).filter((k) => !['kind', 'surface', 'helplineShown'].includes(k));
      if (extra.length) return badRequest(`property ${extra[0]} should not exist`);
      if (
        !KINDS.includes(body.kind as string) ||
        !APP_SURFACES.includes(body.surface as string) ||
        typeof body.helplineShown !== 'boolean'
      )
        return badRequest('Invalid signal');
      const kind = body.kind as SafetyKind;
      const now = Date.now();
      const open = db().safety.flags.find(
        (f) =>
          f.userId === me.userId && f.kind === kind && f.status === 'open' && now - Date.parse(f.lastAt) <= FOLD_MS,
      );
      if (open) {
        open.count += 1;
        open.lastAt = nowIso();
        if (body.helplineShown) open.helplineShown = true;
      } else {
        const f: SafetyFlag = {
          id: mockId('f'),
          userId: me.userId,
          userEmail: me.email,
          kind,
          level: LEVEL_OF[kind],
          surface: body.surface as SafetyFlag['surface'],
          helplineShown: body.helplineShown as boolean,
          count: 1,
          status: 'open',
          firstAt: nowIso(),
          lastAt: nowIso(),
          notes: [],
          reviewedBy: null,
          reviewedAt: null,
          escalations: [],
        };
        db().safety.flags.unshift(f);
        if (f.level !== 'low') alert(f);
      }
      return HttpResponse.json({ ok: true }, { status: 202 });
    }),
  ),

  http.get(p('admin/safety/flags'), ({ request }) =>
    guard(request, 'staff', () => {
      const url = new URL(request.url);
      const q = url.searchParams;
      const from = q.get('from');
      const to = q.get('to');
      const rows = db()
        .safety.flags.filter((f) => {
          if (q.get('status') && f.status !== q.get('status')) return false;
          if (q.get('level') && f.level !== q.get('level')) return false;
          if (q.get('kind') && f.kind !== q.get('kind')) return false;
          if (q.get('userId') && f.userId !== q.get('userId')) return false;
          if (from && f.lastAt < new Date(from).toISOString()) return false;
          // A date counts its whole UTC day.
          if (to && f.lastAt >= new Date(to.length === 10 ? Date.parse(to) + 86_400_000 : Date.parse(to)).toISOString())
            return false;
          return true;
        })
        .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
      return HttpResponse.json(paginate(rows, url));
    }),
  ),

  http.get(p('admin/safety/summary'), ({ request }) =>
    guard(request, 'staff', () => {
      const flags = db().safety.flags;
      const open = flags.filter((f) => f.status === 'open');
      const since = (ms: number) => flags.filter((f) => Date.now() - Date.parse(f.lastAt) <= ms).length;
      return HttpResponse.json({
        open: open.length,
        openHigh: open.filter((f) => f.level === 'high').length,
        openMedium: open.filter((f) => f.level === 'medium').length,
        openLow: open.filter((f) => f.level === 'low').length,
        last24h: since(86_400_000),
        last7d: since(7 * 86_400_000),
      });
    }),
  ),

  http.get(p('admin/safety/flags/:id'), ({ request, params }) =>
    guard(request, 'staff', () => {
      const f = find(params.id);
      return f ? HttpResponse.json(f) : notFound();
    }),
  ),

  http.post(p('admin/safety/flags/:id/review'), ({ request, params }) =>
    guard(request, 'staff', async (me) => {
      const f = find(params.id);
      if (!f) return notFound();
      const { note } = await readJson<{ note?: string }>(request);
      if (note !== undefined && (typeof note !== 'string' || note.length > 2000))
        return badRequest('note: at most 2000 characters');
      f.status = 'reviewed';
      f.reviewedBy = me.userId;
      f.reviewedAt = nowIso();
      if (note?.trim())
        f.notes.push({ id: mockId('n'), by: me.userId, byEmail: me.email, text: note.trim(), at: nowIso() });
      recordAudit(me, 'safety.review', `safety_flag:${f.id}`, {
        userId: f.userId,
        kind: f.kind,
        level: f.level,
        status: f.status,
      });
      return HttpResponse.json(f);
    }),
  ),

  http.post(p('admin/safety/flags/:id/notes'), ({ request, params }) =>
    guard(request, 'staff', async (me) => {
      const f = find(params.id);
      if (!f) return notFound();
      const { text } = await readJson<{ text?: string }>(request);
      if (typeof text !== 'string' || !text.trim() || text.length > 2000)
        return apiError(400, 'A note of 1 to 2000 characters', 'INVALID_NOTE');
      f.notes.push({ id: mockId('n'), by: me.userId, byEmail: me.email, text: text.trim(), at: nowIso() });
      recordAudit(me, 'safety.note', `safety_flag:${f.id}`, {
        userId: f.userId,
        kind: f.kind,
        level: f.level,
        status: f.status,
      });
      return HttpResponse.json(f);
    }),
  ),

  http.post(p('admin/safety/flags/:id/escalate'), ({ request, params }) =>
    guard(request, 'staff', async (me) => {
      const f = find(params.id);
      if (!f) return notFound();
      const { note } = await readJson<{ note?: string }>(request);
      if (note !== undefined && (typeof note !== 'string' || note.length > 500))
        return badRequest('note: at most 500 characters');
      const clean = note?.trim() || null;
      f.status = 'escalated';
      f.escalations.push({ by: me.userId, at: nowIso(), note: clean });
      alert(f, { by: me.userId, note: clean });
      recordAudit(me, 'safety.escalate', `safety_flag:${f.id}`, {
        userId: f.userId,
        kind: f.kind,
        level: f.level,
        status: f.status,
      });
      return HttpResponse.json(f);
    }),
  ),
];
