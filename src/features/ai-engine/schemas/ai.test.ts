import { describe, expect, it } from 'vitest';
import type { AiRuntimeSettings } from '../api/types';
import { aiSettingsSchema, toForm, toInput } from './ai';

const current: AiRuntimeSettings = {
  version: 3,
  provider: 'anthropic',
  anthropic: { model: 'anthropic-default', effort: 'low', refusalFallback: true },
  openai: { model: 'openai-default', temperature: null },
  fallbackOnly: false,
  prompts: { modes: { vent: 'Listen closely.' }, quizStyle: null },
  updatedAt: '2026-11-01T10:00:00Z',
  updatedBy: null,
};

describe('AI settings form', () => {
  it('fills every mode and turns blank prompts back into defaults (null)', () => {
    const form = toForm(current, ['vent', 'side']);
    expect(form.prompts.modes).toEqual({ vent: 'Listen closely.', side: null });
    form.prompts.modes.vent = '   ';
    expect(toInput(form).prompts).toEqual({ modes: { vent: null, side: null }, quizStyle: null });
  });

  it('refuses a provider whose key is missing on the server', () => {
    const form = { ...toForm(current, ['vent']), provider: 'openai' as const };
    const r = aiSettingsSchema({ anthropic: true, openai: false }).safeParse(form);
    expect(r.success).toBe(false);
    expect(r.success ? '' : r.error.issues[0]!.message).toBe('OPENAI_API_KEY is not set on the server.');
    expect(aiSettingsSchema({ anthropic: true, openai: false }).safeParse({ ...form, provider: 'none' }).success).toBe(
      true,
    );
  });

  it('checks model names, temperature 0 to 2, prompt length and note length', () => {
    const s = aiSettingsSchema({ anthropic: true, openai: true });
    const base = toForm(current, ['vent']);
    expect(s.safeParse({ ...base, anthropic: { ...base.anthropic, model: 'has spaces' } }).success).toBe(false);
    expect(s.safeParse({ ...base, openai: { ...base.openai, temperature: 2.5 } }).success).toBe(false);
    expect(s.safeParse({ ...base, prompts: { ...base.prompts, quizStyle: 'x'.repeat(1501) } }).success).toBe(false);
    expect(s.safeParse({ ...base, note: 'x'.repeat(301) }).success).toBe(false);
    expect(s.safeParse(base).success).toBe(true);
  });
});
