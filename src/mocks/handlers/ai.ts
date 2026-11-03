// ADMIN_API.md › AI engine (admin; clinician read-only).
import { delay, http, HttpResponse } from 'msw';
import type { AiSettingsInput } from '@/features/ai-engine/api/types';
import { AI_MODES, DEFAULT_MODE_TASKS, DEFAULT_QUIZ_STYLE, ENV_DEFAULTS, LOCKED, runtimeOf } from '../data/ai';
import { db, recordAudit } from '../db';
import { guard } from '../session';
import { apiError, badRequest, nowIso, p, paginate, readJson } from '../utils';

const MODEL_NAME = /^[A-Za-z0-9._:/-]{1,100}$/;
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

const latest = () => db().ai.versions.at(-1) ?? null;
const current = () => {
  const v = latest();
  return v ? runtimeOf(v) : { version: 0, ...structuredClone(ENV_DEFAULTS), updatedAt: nowIso(), updatedBy: null };
};

class Invalid extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** normalizeSettings() from the backend ai-engine domain. */
function normalize(input: Partial<AiSettingsInput>): AiSettingsInput {
  const keys = db().ai.keys;
  const bad = (m: string) => new Invalid('INVALID_AI_SETTINGS', m);
  if (!['anthropic', 'openai', 'none'].includes(input.provider as string))
    throw bad(`Unknown provider "${String(input.provider)}"`);
  if (input.provider === 'anthropic' && !keys.anthropic)
    throw new Invalid('PROVIDER_NOT_CONFIGURED', 'ANTHROPIC_API_KEY is not set on the server');
  if (input.provider === 'openai' && !keys.openai)
    throw new Invalid('PROVIDER_NOT_CONFIGURED', 'OPENAI_API_KEY is not set on the server');
  const a = input.anthropic;
  if (!a || !MODEL_NAME.test(a.model ?? '')) throw bad('anthropic.model is not a model name');
  if (!EFFORTS.includes(a.effort)) throw bad('anthropic.effort must be low, medium, high, xhigh or max');
  const o = input.openai;
  if (!o || !MODEL_NAME.test(o.model ?? '')) throw bad('openai.model is not a model name');
  const t = o.temperature ?? null;
  if (t !== null && (typeof t !== 'number' || t < 0 || t > 2))
    throw bad('openai.temperature must be between 0 and 2, or null');
  const modesIn = input.prompts?.modes ?? {};
  const unknown = Object.keys(modesIn).filter((k) => !AI_MODES.includes(k));
  if (unknown.length) throw bad(`Unknown Third Ear mode: ${unknown.join(', ')}`);
  const text = (v: unknown, field: string) => {
    if (v == null) return null;
    if (typeof v !== 'string') throw bad(`${field} must be text or null`);
    const s = v.trim();
    if (s.length > 1500) throw bad(`${field} is longer than 1500 characters`);
    return s || null;
  };
  return {
    provider: input.provider as AiSettingsInput['provider'],
    anthropic: { model: a.model, effort: a.effort, refusalFallback: a.refusalFallback === true },
    openai: { model: o.model, temperature: t },
    fallbackOnly: input.fallbackOnly === true,
    prompts: {
      modes: Object.fromEntries(AI_MODES.map((m) => [m, text(modesIn[m], `prompts.modes.${m}`)])),
      quizStyle: text(input.prompts?.quizStyle, 'prompts.quizStyle'),
    },
  };
}

const risky = /\b(hurt (myself|me)|kill|suicide|end it all|hit me|unsafe|scared of (him|her|them))\b/i;

const sampleReply: Record<string, string> = {
  vent: 'That sounds like a heavy evening. You felt brushed off when you tried to share your news. What would have helped in that moment?',
  side: 'One possibility: Alex was still in work mode and did not notice how much it mattered to you. Does that fit?',
  decode: 'You could ask: "When you said you were fine, did you mean it, or do you need a bit of time?"',
  kind: 'Try: "I felt left out when plans changed without me. Could we decide weekends together?"',
  quiz: '{"headline":"You two plan alike","summary":"You both want weekends that start slow. Where you differ is how much you plan ahead.","insights":[...],"tryThis":"Pick one slow Saturday morning this month."}',
};

export const aiHandlers = [
  http.get(p('admin/ai/settings'), ({ request }) =>
    guard(request, 'staff', () =>
      HttpResponse.json({
        current: current(),
        defaults: {
          provider: ENV_DEFAULTS.provider,
          anthropic: ENV_DEFAULTS.anthropic,
          openai: ENV_DEFAULTS.openai,
          prompts: { modes: { ...DEFAULT_MODE_TASKS }, quizStyle: DEFAULT_QUIZ_STYLE },
          supports: { temperature: { anthropic: false, openai: true } },
        },
        keys: db().ai.keys,
        modes: AI_MODES,
        locked: LOCKED,
      }),
    ),
  ),

  http.put(p('admin/ai/settings'), ({ request }) =>
    guard(request, 'admin', async (me) => {
      const body = await readJson<Partial<AiSettingsInput> & { note?: string }>(request);
      if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 300))
        return badRequest('note must be shorter than or equal to 300 characters');
      try {
        const settings = normalize(body);
        const version = (latest()?.version ?? 0) + 1;
        db().ai.versions.push({
          version,
          settings,
          note: body.note?.trim() || null,
          updatedBy: me.userId,
          updatedByEmail: me.email,
          createdAt: nowIso(),
        });
        recordAudit(me, 'ai.settings.update', `ai-settings:${version}`, {
          provider: settings.provider,
          fallbackOnly: settings.fallbackOnly,
        });
        return HttpResponse.json(current());
      } catch (e) {
        if (e instanceof Invalid) return apiError(400, e.message, e.code);
        throw e;
      }
    }),
  ),

  http.get(p('admin/ai/settings/history'), ({ request }) =>
    guard(request, 'staff', () => {
      const rows = [...db().ai.versions].reverse().map((v) => ({
        version: v.version,
        updatedAt: v.createdAt,
        updatedBy: v.updatedBy,
        updatedByEmail: v.updatedByEmail,
        note: v.note,
        settings: runtimeOf(v),
      }));
      return HttpResponse.json(paginate(rows, new URL(request.url)));
    }),
  ),

  http.post(p('admin/ai/settings/rollback'), ({ request }) =>
    guard(request, 'admin', async (me) => {
      const { version } = await readJson<{ version?: number }>(request);
      const target = db().ai.versions.find((v) => v.version === version);
      if (!target) return apiError(404, 'No such version', 'VERSION_NOT_FOUND');
      try {
        const settings = normalize(structuredClone(target.settings));
        const next = (latest()?.version ?? 0) + 1;
        db().ai.versions.push({
          version: next,
          settings,
          note: `Rollback to version ${target.version}`,
          updatedBy: me.userId,
          updatedByEmail: me.email,
          createdAt: nowIso(),
        });
        recordAudit(me, 'ai.settings.rollback', `ai-settings:${next}`, { from: target.version });
        return HttpResponse.json(current());
      } catch (e) {
        if (e instanceof Invalid) return apiError(400, e.message, e.code);
        throw e;
      }
    }),
  ),

  http.post(p('admin/ai/test'), ({ request }) =>
    guard(request, 'admin', async () => {
      const body = await readJson<{ mode?: string; text?: string; draft?: Partial<AiSettingsInput> }>(request);
      if (!body.mode || (!AI_MODES.includes(body.mode) && body.mode !== 'quiz'))
        return badRequest('mode must be a Third Ear mode or quiz');
      if (!body.text?.trim() || body.text.length > 1000) return badRequest('text must be 1 to 1000 characters');
      let s: AiSettingsInput;
      try {
        s = body.draft ? normalize(body.draft) : current();
      } catch (e) {
        if (e instanceof Invalid) return apiError(400, e.message, e.code);
        throw e;
      }
      const started = performance.now();
      const model = s.provider === 'anthropic' ? s.anthropic.model : s.provider === 'openai' ? s.openai.model : null;
      if (risky.test(body.text)) {
        return HttpResponse.json({
          source: 'risk',
          reply:
            'Your safety comes first. If you are in danger, call your local emergency number. Need help now? shows helplines near you.',
          latencyMs: 3,
          provider: s.provider,
          model,
        });
      }
      if (s.fallbackOnly || s.provider === 'none') {
        return HttpResponse.json({
          source: 'fallback',
          reply: `AI is off (${s.fallbackOnly ? 'fallback only' : 'provider none'}), so the app shows its built-in copy for this mode.`,
          latencyMs: 2,
          provider: s.provider,
          model,
        });
      }
      await delay(import.meta.env.MODE === 'test' ? 10 : 700);
      return HttpResponse.json({
        source: 'ai',
        reply: sampleReply[body.mode] ?? 'Thanks for telling me. What matters most to you about this right now?',
        latencyMs: Math.round(performance.now() - started) + 600,
        provider: s.provider,
        model,
      });
    }),
  ),
];
