// Remote Config as reconciled with v2.0.0 (STAFF_API.md §6): the public `GET app-config` the
// released app reads ({ version, updatedAt, features, maintenance, minAppVersion,
// recommendedAppVersion }, version 0 = the defaults before anything is published, the maintenance
// message hidden while maintenance is off) and the staff routes: the admin view, draft (merges over
// the current draft), publish, versions and rollback (also replaces the draft; 0 = the defaults).
// `baseVersion` is the DRAFT's version; every write bumps it; a stale one is 409 CONFIG_CONFLICT.
// The rules are the backend's applyAppConfigUpdate (libs/common), with its messages.
import { http, HttpResponse } from 'msw';
import type { AppConfigBody, ConfigVersion } from '@/features/app-config/api/types';
import { defaultConfig, MOCK_FEATURES, MOCK_LIMITS, type AppConfigDraft } from '../data/app-config';
import { db, recordAudit } from '../db';
import { guard, type MockActor } from '../session';
import { apiError, badRequest, nowIso, p, paginate, readJson } from '../utils';

const MESSAGE_MAX = MOCK_LIMITS.maintenanceMessageMax;
const NOTE_MAX = MOCK_LIMITS.noteMax;
const VERSION_RE = /^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
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
  if (a.minAppVersion !== b.minAppVersion) out.push('minAppVersion');
  if (a.recommendedAppVersion !== b.recommendedAppVersion) out.push('recommendedAppVersion');
  return out;
}

/** The backend's applyAppConfigUpdate: merges a partial change and checks every rule. */
function applyInput(
  base: AppConfigBody,
  input: Record<string, unknown>,
): { config: AppConfigBody } | { problems: string[] } {
  const problems: string[] = [];
  const next: AppConfigBody = structuredClone(base);
  for (const k of Object.keys(input))
    if (!['features', 'maintenance', 'minAppVersion', 'recommendedAppVersion'].includes(k))
      problems.push(`${k.slice(0, 40)} is not a Remote Config field`);
  const f = input.features;
  if (f !== undefined) {
    if (!f || typeof f !== 'object' || Array.isArray(f))
      problems.push('features must be an object of feature switches');
    else
      for (const [k, v] of Object.entries(f)) {
        if (!KEYS.includes(k))
          problems.push(`features.${k.slice(0, 40)} is not a feature key (known: ${KEYS.join(', ')})`);
        else if (typeof v !== 'boolean') problems.push(`features.${k} must be true or false`);
        else next.features[k] = v;
      }
  }
  const m = input.maintenance as Record<string, unknown> | null | undefined;
  if (m !== undefined) {
    if (!m || typeof m !== 'object' || Array.isArray(m))
      problems.push('maintenance must be an object with enabled and message');
    else {
      if (m.enabled !== undefined) {
        if (typeof m.enabled !== 'boolean') problems.push('maintenance.enabled must be true or false');
        else next.maintenance.enabled = m.enabled;
      }
      if (m.message !== undefined) {
        if (m.message === null) next.maintenance.message = null;
        else if (typeof m.message !== 'string') problems.push('maintenance.message must be text or null');
        else {
          const text = m.message.trim();
          if (text.length > MESSAGE_MAX) problems.push(`maintenance.message is longer than ${MESSAGE_MAX} characters`);
          else if (CONTROL.test(text)) problems.push('maintenance.message has control characters');
          else next.maintenance.message = text || null;
        }
      }
    }
  }
  for (const field of ['minAppVersion', 'recommendedAppVersion'] as const) {
    const v = input[field];
    if (v === undefined) continue;
    if (v === null) next[field] = null;
    else if (typeof v !== 'string' || !VERSION_RE.test(v))
      problems.push(`${field} must be an app version like 1.4.0 (MAJOR.MINOR.PATCH) or null`);
    else next[field] = v;
  }
  if (!problems.length) {
    if (next.maintenance.enabled && !next.maintenance.message)
      problems.push('maintenance.message is required while maintenance is on');
    if (next.minAppVersion && next.recommendedAppVersion && cmp(next.recommendedAppVersion, next.minAppVersion) < 0)
      problems.push('recommendedAppVersion can’t be lower than minAppVersion');
  }
  return problems.length ? { problems } : { config: next };
}

const invalid = (problems: string[]) =>
  apiError(400, 'Some settings aren’t valid.', 'INVALID_CONFIG', { details: problems });

/** GET admin/app-config, and the answer of every write. */
function adminView() {
  const d = currentDraft();
  return {
    draft: { config: structuredClone(d.config), version: d.version, changed: changedFields(liveConfig(), d.config) },
    published: latest() ? structuredClone(latest()) : null,
    features: MOCK_FEATURES,
    limits: MOCK_LIMITS,
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
  return note !== undefined && (typeof note !== 'string' || note.length > NOTE_MAX)
    ? badRequest(`note must be shorter than or equal to ${NOTE_MAX} characters`)
    : null;
}

/** The non-text facts the backend audits on publish and rollback (never the note or the message). */
function summary(previous: AppConfigBody, next: AppConfigBody) {
  return {
    featuresOff: KEYS.filter((k) => next.features[k] === false),
    featuresTurnedOff: KEYS.filter((k) => previous.features[k] !== false && next.features[k] === false),
    maintenance: next.maintenance.enabled,
    minAppVersion: next.minAppVersion,
    recommendedAppVersion: next.recommendedAppVersion,
  };
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
  // Public and read-only (the app's route): only the published, public fields; version 0 = the
  // defaults. The maintenance message only while maintenance is on.
  http.get(p('app-config'), () => {
    const l = latest();
    const c = liveConfig();
    return HttpResponse.json(
      {
        version: l?.version ?? 0,
        updatedAt: l?.publishedAt ?? new Date(0).toISOString(),
        features: Object.fromEntries(KEYS.map((k) => [k, c.features[k] !== false])),
        maintenance: { enabled: c.maintenance.enabled, message: c.maintenance.enabled ? c.maintenance.message : null },
        minAppVersion: c.minAppVersion,
        recommendedAppVersion: c.recommendedAppVersion,
      },
      { headers: { 'Cache-Control': 'public, max-age=30' } },
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
      if ('problems' in r) return invalid(r.problems);
      const changed = changedFields(d.config, r.config);
      if (!changed.length) return HttpResponse.json(adminView());
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
      // A draft saved under older rules is checked again.
      const checked = applyInput(defaultConfig(), d.config as unknown as Record<string, unknown>);
      if ('problems' in checked) return invalid(checked.problems);
      const previous = liveConfig();
      const previousVersion = latest()?.version ?? 0;
      const changed = changedFields(previous, d.config);
      if (latest() && !changed.length) return unchanged();
      const version = release(me, d.config, {
        kind: 'publish',
        note: typeof note === 'string' && note.trim() ? note.trim() : null,
        rolledBackFrom: null,
      });
      recordAudit(me, 'config.publish', 'app_config', {
        version,
        previousVersion,
        changed,
        ...summary(previous, d.config),
      });
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
      // 0 = the defaults (every feature on, no maintenance, no version gates).
      const target =
        version === 0 ? defaultConfig() : db().appConfig.versions.find((v) => v.version === version)?.config;
      if (!target) return apiError(404, 'No published Remote Config with that version.', 'CONFIG_VERSION_NOT_FOUND');
      const stale = checkBase(baseVersion);
      if (stale) return stale;
      const previous = liveConfig();
      const previousVersion = latest()?.version ?? 0;
      const changed = changedFields(previous, target);
      if (!changed.length) return unchanged();
      const next = release(me, target, {
        kind: 'rollback',
        note: typeof note === 'string' && note.trim() ? note.trim() : null,
        rolledBackFrom: version as number,
      });
      recordAudit(me, 'config.rollback', 'app_config', {
        version: next,
        previousVersion,
        from: version,
        changed,
        ...summary(previous, target),
      });
      return HttpResponse.json(adminView());
    }),
  ),
];
