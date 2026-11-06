// Remote Config as built on feature/support-remote-config (STAFF_API.md §6 "As built"): the public
// `GET app-config` (version 0 = the default before anything is published) and the admin view,
// draft (merges over the current draft), publish, versions and rollback (also replaces the draft).
// `baseVersion` is the DRAFT's version; every write bumps it; a stale one is 409 CONFIG_CONFLICT.
import { http, HttpResponse } from 'msw';
import type { AppConfigBody, ConfigVersion } from '@/features/app-config/api/types';
import { defaultConfig, MOCK_FEATURES, type AppConfigDraft } from '../data/app-config';
import { db, recordAudit } from '../db';
import { guard, type MockActor } from '../session';
import { apiError, badRequest, nowIso, p, paginate, readJson } from '../utils';

const MESSAGE_MAX = 280;
const VERSION_RE = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;
const KEYS = MOCK_FEATURES.map((f) => f.key);

const latest = (): ConfigVersion | null => db().appConfig.versions.at(-1) ?? null;
const liveConfig = (): AppConfigBody => structuredClone(latest()?.config ?? defaultConfig());

function currentDraft(): AppConfigDraft {
  const l = latest();
  return (
    db().appConfig.draft ?? {
      config: liveConfig(),
      version: 0,
      updatedAt: l?.publishedAt ?? null,
      updatedBy: l?.publishedBy ?? null,
      updatedByName: l?.publishedByName ?? null,
    }
  );
}

const cmp = (a: string, b: string) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

/** Field paths that differ (the backend's changedFields). */
function changedFields(a: AppConfigBody, b: AppConfigBody): string[] {
  const out: string[] = [];
  for (const k of KEYS) if ((a.features[k] ?? true) !== (b.features[k] ?? true)) out.push(`features.${k}`);
  if (a.maintenance.enabled !== b.maintenance.enabled) out.push('maintenance.enabled');
  if (a.maintenance.message !== b.maintenance.message) out.push('maintenance.message');
  if (a.minVersion !== b.minVersion) out.push('minVersion');
  if (a.recommendedVersion !== b.recommendedVersion) out.push('recommendedVersion');
  return out;
}

/** The backend's applyInput: merges a partial change over the draft and checks every rule. */
function applyInput(
  base: AppConfigBody,
  input: Record<string, unknown>,
): { config: AppConfigBody } | { problems: string[] } {
  const problems: string[] = [];
  const features = { ...base.features };
  const f = input.features;
  if (f !== undefined) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) problems.push('features must be an object of switches.');
    else
      for (const [k, v] of Object.entries(f)) {
        if (!KEYS.includes(k)) problems.push(`Unknown feature: ${k}`);
        else if (typeof v !== 'boolean') problems.push(`features.${k} must be true or false.`);
        else features[k] = v;
      }
  }
  const maintenance = { ...base.maintenance };
  const m = input.maintenance as { enabled?: unknown; message?: unknown } | undefined;
  if (m !== undefined) {
    if (m.enabled !== undefined) {
      if (typeof m.enabled !== 'boolean') problems.push('maintenance.enabled must be true or false.');
      else maintenance.enabled = m.enabled;
    }
    if (m.message !== undefined) {
      const msg = typeof m.message === 'string' ? m.message.trim() : '';
      if (msg.length > MESSAGE_MAX) problems.push(`The maintenance message can be at most ${MESSAGE_MAX} characters.`);
      maintenance.message = msg || null;
    }
  }
  const version = (field: 'minVersion' | 'recommendedVersion'): string | null => {
    const v = input[field];
    if (v === undefined) return base[field];
    if (v === null || v === '') return null;
    if (typeof v !== 'string' || !VERSION_RE.test(v.trim())) {
      problems.push(`${field} must look like 1.2.3.`);
      return null;
    }
    return v.trim();
  };
  const minVersion = version('minVersion');
  const recommendedVersion = version('recommendedVersion');
  if (minVersion && recommendedVersion && cmp(recommendedVersion, minVersion) < 0)
    problems.push('The recommended version must be the same as or newer than the minimum version.');
  return problems.length ? { problems } : { config: { features, maintenance, minVersion, recommendedVersion } };
}

/** GET admin/app-config, and the answer of every write. */
function adminView() {
  const d = currentDraft();
  return {
    draft: { config: structuredClone(d.config), version: d.version, changed: changedFields(liveConfig(), d.config) },
    published: latest() ? structuredClone(latest()) : null,
    features: MOCK_FEATURES,
    updatedAt: d.updatedAt,
    updatedBy: d.updatedBy,
    updatedByName: d.updatedByName,
  };
}

const conflict = () =>
  apiError(
    409,
    'Someone else changed Remote Config since you opened it. Reload to see their version, then make your change again.',
    'CONFIG_CONFLICT',
  );
const unchanged = () => apiError(409, 'This is already what the app gets. Nothing to publish.', 'CONFIG_UNCHANGED');

function checkBase(baseVersion: unknown): Response | null {
  if (typeof baseVersion !== 'number' || !Number.isInteger(baseVersion) || baseVersion < 0)
    return badRequest('baseVersion must be an integer ≥ 0');
  return baseVersion === currentDraft().version ? null : conflict();
}

function noteProblem(note: unknown): Response | null {
  return note !== undefined && (typeof note !== 'string' || note.length > 300)
    ? badRequest('note must be shorter than or equal to 300 characters')
    : null;
}

/** Claims the draft (bumps its version), then appends the next published version. */
function release(me: MockActor, config: AppConfigBody, what: Pick<ConfigVersion, 'kind' | 'note' | 'rolledBackFrom'>) {
  const s = db().appConfig;
  const d = currentDraft();
  const at = nowIso();
  s.draft = {
    config: structuredClone(config),
    version: d.version + 1,
    updatedAt: at,
    updatedBy: me.userId,
    updatedByName: me.name,
  };
  const version = (latest()?.version ?? 0) + 1;
  s.versions.push({
    version,
    config: structuredClone(config),
    ...what,
    publishedBy: me.userId,
    publishedByName: me.name,
    publishedAt: at,
  });
  return version;
}

export const appConfigHandlers = [
  // Public and read-only (the app's route): only the published, public fields; version 0 = default.
  http.get(p('app-config'), () => {
    const l = latest();
    const c = liveConfig();
    return HttpResponse.json(
      { version: l?.version ?? 0, ...c, publishedAt: l?.publishedAt ?? null },
      { headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  }),

  http.get(p('admin/app-config'), ({ request }) => guard(request, 'config.read', () => HttpResponse.json(adminView()))),

  http.put(p('admin/app-config/draft'), ({ request }) =>
    guard(request, 'config.edit', async (me) => {
      const { config, baseVersion } = await readJson<{ config?: Record<string, unknown>; baseVersion?: unknown }>(
        request,
      );
      if (!config || typeof config !== 'object') return badRequest('config must be an object');
      const stale = checkBase(baseVersion);
      if (stale) return stale;
      const d = currentDraft();
      const r = applyInput(d.config, config);
      if ('problems' in r)
        return apiError(400, 'The config did not pass validation.', 'INVALID_CONFIG', { details: r.problems });
      const changed = changedFields(d.config, r.config);
      db().appConfig.draft = {
        config: r.config,
        version: d.version + 1,
        updatedAt: nowIso(),
        updatedBy: me.userId,
        updatedByName: me.name,
      };
      recordAudit(me, 'config.draft', 'app_config', { draftVersion: d.version + 1, changed });
      return HttpResponse.json(adminView());
    }),
  ),

  http.post(p('admin/app-config/publish'), ({ request }) =>
    guard(request, 'config.publish', async (me) => {
      const { note, baseVersion } = await readJson<{ note?: unknown; baseVersion?: unknown }>(request);
      const bad = noteProblem(note) ?? checkBase(baseVersion);
      if (bad) return bad;
      const d = currentDraft();
      const changed = changedFields(liveConfig(), d.config);
      if (latest() && !changed.length) return unchanged();
      const version = release(me, d.config, {
        kind: 'publish',
        note: typeof note === 'string' && note.trim() ? note.trim() : null,
        rolledBackFrom: null,
      });
      recordAudit(me, 'config.publish', 'app_config', { version, changed });
      return HttpResponse.json(adminView());
    }),
  ),

  http.get(p('admin/app-config/versions'), ({ request }) =>
    guard(request, 'config.read', () =>
      HttpResponse.json(paginate([...db().appConfig.versions].reverse(), new URL(request.url))),
    ),
  ),

  http.post(p('admin/app-config/rollback'), ({ request }) =>
    guard(request, 'config.rollback', async (me) => {
      const { version, note, baseVersion } = await readJson<{
        version?: unknown;
        note?: unknown;
        baseVersion?: unknown;
      }>(request);
      const bad = noteProblem(note);
      if (bad) return bad;
      const old = db().appConfig.versions.find((v) => v.version === version);
      if (!old) return apiError(404, 'No published Remote Config with that version.', 'CONFIG_VERSION_NOT_FOUND');
      const stale = checkBase(baseVersion);
      if (stale) return stale;
      const changed = changedFields(liveConfig(), old.config);
      if (!changed.length) return unchanged();
      const next = release(me, old.config, {
        kind: 'rollback',
        note: typeof note === 'string' && note.trim() ? note.trim() : null,
        rolledBackFrom: old.version,
      });
      recordAudit(me, 'config.rollback', 'app_config', { version: next, from: old.version, changed });
      return HttpResponse.json(adminView());
    }),
  ),
];
