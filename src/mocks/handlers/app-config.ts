// Remote Config (STAFF_API.md §6): the public `GET app-config` and the admin draft, publish,
// versions and rollback, with `baseVersion` checks (409 CONFIG_CONFLICT).
import { http, HttpResponse } from 'msw';
import type { AppConfigBody } from '@/features/app-config/api/types';
import { MOCK_FEATURES } from '../data/app-config';
import { db, recordAudit } from '../db';
import { guard } from '../session';
import { apiError, badRequest, nowIso, p, paginate, readJson } from '../utils';

const VERSION_RE = /^\d+\.\d+\.\d+$/;
const live = () => db().appConfig.versions[db().appConfig.versions.length - 1]!;
const published = () => ({
  ...structuredClone(live().config),
  version: live().version,
  publishedAt: live().publishedAt,
});

function admin() {
  const s = db().appConfig;
  return {
    draft: structuredClone(s.draft),
    published: published(),
    features: MOCK_FEATURES,
    updatedAt: s.updatedAt,
    updatedBy: s.updatedBy,
    updatedByName: s.updatedByName,
  };
}

/** The server's validation: known feature keys only, booleans, message ≤ 280, versions x.y.z. */
function problems(c: unknown): string[] {
  const out: string[] = [];
  const v = c as Partial<AppConfigBody> | null;
  if (!v || typeof v !== 'object') return ['config must be an object'];
  const keys = new Set(MOCK_FEATURES.map((f) => f.key));
  for (const [k, on] of Object.entries(v.features ?? {})) {
    if (!keys.has(k)) out.push(`features.${k}: unknown feature`);
    else if (typeof on !== 'boolean') out.push(`features.${k}: must be true or false`);
  }
  if (typeof v.maintenance?.enabled !== 'boolean') out.push('maintenance.enabled must be a boolean');
  const msg = v.maintenance?.message;
  if (msg != null && (typeof msg !== 'string' || msg.length > 280))
    out.push('maintenance.message: at most 280 characters');
  for (const f of ['minVersion', 'recommendedVersion'] as const)
    if (v[f] != null && !VERSION_RE.test(String(v[f]))) out.push(`${f} must look like x.y.z`);
  return out;
}

const conflict = () =>
  apiError(409, 'Remote Config changed since you loaded it.', 'CONFIG_CONFLICT', {
    details: [`baseVersion: the published version is now ${live().version}`],
  });

export const appConfigHandlers = [
  // Public and read-only (the app's route): only the published, public fields.
  http.get(p('app-config'), () =>
    HttpResponse.json(published(), { headers: { 'Cache-Control': 'public, max-age=60' } }),
  ),

  http.get(p('admin/app-config'), ({ request }) => guard(request, 'config.read', () => HttpResponse.json(admin()))),

  http.put(p('admin/app-config/draft'), ({ request }) =>
    guard(request, 'config.edit', async (me) => {
      const { config, baseVersion } = await readJson<{ config?: AppConfigBody; baseVersion?: number }>(request);
      if (typeof baseVersion !== 'number') return badRequest('baseVersion must be a number');
      if (baseVersion !== live().version) return conflict();
      const bad = problems(config);
      if (bad.length) return apiError(400, 'The config did not pass validation.', 'INVALID_CONFIG', { details: bad });
      const s = db().appConfig;
      s.draft = structuredClone(config!);
      s.updatedAt = nowIso();
      s.updatedBy = me.userId;
      s.updatedByName = me.name;
      recordAudit(me, 'app_config.draft', 'app_config:draft');
      return HttpResponse.json(admin());
    }),
  ),

  http.post(p('admin/app-config/publish'), ({ request }) =>
    guard(request, 'config.publish', async (me) => {
      const { note, baseVersion } = await readJson<{ note?: string; baseVersion?: number }>(request);
      if (typeof baseVersion !== 'number') return badRequest('baseVersion must be a number');
      if (baseVersion !== live().version) return conflict();
      const s = db().appConfig;
      const version = live().version + 1;
      s.versions.push({
        version,
        config: structuredClone(s.draft),
        publishedAt: nowIso(),
        publishedBy: me.userId,
        publishedByName: me.name,
        note: note?.trim() || null,
      });
      recordAudit(me, 'app_config.publish', `app_config:${version}`);
      return HttpResponse.json(published());
    }),
  ),

  http.get(p('admin/app-config/versions'), ({ request }) =>
    guard(request, 'config.read', () =>
      HttpResponse.json(paginate([...db().appConfig.versions].reverse(), new URL(request.url))),
    ),
  ),

  http.post(p('admin/app-config/rollback'), ({ request }) =>
    guard(request, 'config.rollback', async (me) => {
      const { version, note, baseVersion } = await readJson<{ version?: number; note?: string; baseVersion?: number }>(
        request,
      );
      if (typeof baseVersion !== 'number') return badRequest('baseVersion must be a number');
      if (baseVersion !== live().version) return conflict();
      const s = db().appConfig;
      const target = s.versions.find((v) => v.version === version);
      if (!target) return apiError(404, 'No such version.', 'VERSION_NOT_FOUND');
      if (target.version === live().version) return apiError(409, 'That version is live.', 'ALREADY_LIVE');
      const next = live().version + 1;
      s.versions.push({
        version: next,
        config: structuredClone(target.config),
        publishedAt: nowIso(),
        publishedBy: me.userId,
        publishedByName: me.name,
        note: note?.trim() || null,
        rolledBackFrom: target.version,
      });
      s.draft = structuredClone(target.config);
      recordAudit(me, 'app_config.rollback', `app_config:${next}`, { from: target.version });
      return HttpResponse.json(published());
    }),
  ),
];
