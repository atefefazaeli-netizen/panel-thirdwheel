import { z } from 'zod';
import { EFFORTS, type AiRuntimeSettings, type AiSettingsInput } from '../api/types';

export const MODEL_NAME = /^[A-Za-z0-9._:/-]{1,100}$/;
export const PROMPT_MAX = 1500;
export const NOTE_MAX = 300;
export const TEST_TEXT_MAX = 1000;

const model = z.string().trim().regex(MODEL_NAME, 'Letters, digits and . _ : / - (up to 100).');
const prompt = z.string().max(PROMPT_MAX, `At most ${PROMPT_MAX} characters.`).nullable();

/** The settings form. A provider without an API key on the server can't be saved. */
export const aiSettingsSchema = (keys: { anthropic: boolean; openai: boolean }) =>
  z
    .object({
      provider: z.enum(['anthropic', 'openai', 'none']),
      anthropic: z.object({ model, effort: z.enum(EFFORTS), refusalFallback: z.boolean() }),
      openai: z.object({ model, temperature: z.number().min(0, 'From 0 to 2.').max(2, 'From 0 to 2.').nullable() }),
      fallbackOnly: z.boolean(),
      prompts: z.object({ modes: z.record(z.string(), prompt), quizStyle: prompt }),
      note: z.string().trim().max(NOTE_MAX, `At most ${NOTE_MAX} characters.`),
    })
    .superRefine((v, ctx) => {
      if (v.provider === 'anthropic' && !keys.anthropic)
        ctx.addIssue({ code: 'custom', path: ['provider'], message: 'ANTHROPIC_API_KEY is not set on the server.' });
      if (v.provider === 'openai' && !keys.openai)
        ctx.addIssue({ code: 'custom', path: ['provider'], message: 'OPENAI_API_KEY is not set on the server.' });
    });
export type AiSettingsForm = z.infer<ReturnType<typeof aiSettingsSchema>>;

export const testSchema = z
  .object({
    mode: z.string().min(1),
    text: z.string().trim().min(1, 'Type a message to try.').max(TEST_TEXT_MAX, `At most ${TEST_TEXT_MAX} characters.`),
    useDraft: z.boolean(),
    /** STAFF_API.md §7: optional published content as read-only context. */
    useContent: z.boolean(),
    contentId: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    if (v.useContent && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(v.contentId))
      ctx.addIssue({
        code: 'custom',
        path: ['contentId'],
        message: 'Pick a content item (its id, like my-perfect-day).',
      });
  });

/** Blank prompt text means "built-in default" (null), as the server stores it. */
export const cleanPrompt = (s: string | null | undefined) => (typeof s === 'string' && s.trim() ? s.trim() : null);

export function toForm(s: AiRuntimeSettings, modes: string[]): AiSettingsForm {
  return {
    provider: s.provider,
    anthropic: { ...s.anthropic },
    openai: { ...s.openai },
    fallbackOnly: s.fallbackOnly,
    prompts: {
      modes: Object.fromEntries(modes.map((m) => [m, s.prompts.modes[m] ?? null])),
      quizStyle: s.prompts.quizStyle ?? null,
    },
    note: '',
  };
}

export function toInput(v: AiSettingsForm): AiSettingsInput {
  return {
    provider: v.provider,
    anthropic: {
      model: v.anthropic.model.trim(),
      effort: v.anthropic.effort,
      refusalFallback: v.anthropic.refusalFallback,
    },
    openai: { model: v.openai.model.trim(), temperature: v.openai.temperature },
    fallbackOnly: v.fallbackOnly,
    prompts: {
      modes: Object.fromEntries(Object.entries(v.prompts.modes).map(([k, t]) => [k, cleanPrompt(t)])),
      quizStyle: cleanPrompt(v.prompts.quizStyle),
    },
  };
}
