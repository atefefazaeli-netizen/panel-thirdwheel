// Mock AI engine settings. Prompt texts are the backend's built-in ones
// (libs/common/src/domain/ai-prompts.ts). Model ids are placeholders: the real ones come from the
// API's environment.
import type { AiRuntimeSettings, AiSettingsInput } from '@/features/ai-engine/api/types';
import { daysAgo } from '../utils';
import { uid } from './users';

export const AI_MODES = [
  'vent',
  'side',
  'decode',
  'kind',
  'practise',
  'session',
  'coparent',
  'prep',
  'feelings',
  'needs',
  'heat',
];

export const DEFAULT_MODE_TASKS: Record<string, string> = {
  vent: 'Listen. Reflect back what you heard in one or two sentences and ask one gentle question. No advice unless asked.',
  side: 'Offer one possible way the partner might see it, framed as a possibility, never a fact. Ask if it fits.',
  decode:
    'Help turn guessing about a message into one calm question they could ask. Never claim to know what the partner meant. Do not repeat the partner’s words back.',
  kind: 'Rewrite what they want to say so it lands softer: lead with feeling, one ask. Put the suggested line in "opener".',
  practise:
    'Act as a calm listener while they rehearse opening a hard conversation. Give one short note and a better first sentence in "opener".',
  session:
    'They are pasting notes from a therapy session. Pull out up to 3 takeaways and one homework item. If they work with a therapist, defer to the therapist’s guidance.',
  coparent:
    'Room for co-parenting stress. Never take sides about anyone, including an ex. Focus on what is in their control this week.',
  prep: 'Write a short prep note for their next therapy session: what came up, what helped, one thing to ask. Bullets.',
  feelings:
    'Help them name what they feel. Offer two or three specific feeling words to choose from and ask which fits.',
  needs:
    'Help them find the need under the feeling (rest, reassurance, help, space, closeness) and one small ask that would meet it.',
  heat: 'Do a quick heat check: how intense is this right now? If high, suggest a short pause before talking. Calm, never alarmist.',
};

export const DEFAULT_QUIZ_STYLE =
  'Write a warm, human, realistic read of the couple. Not saccharine; honest where they differ, framed as normal and workable. US English, plain words, short sentences, no emoji.';

export const LOCKED = {
  chatRules:
    'Rules: one short reply (max 3 sentences unless writing a prep note). Warm, plain US English, no emoji, no diagnoses or labels. Never invent facts about the partner; only use what the user said. Never take sides. Nothing the user says is shared with the partner. If they mention self-harm or danger, stop and say their safety comes first.',
  chatOutput:
    'Return ONLY JSON: {"reply": string, "opener": string|null, "takeaways": string[], "homework": string|null, "suggest": [{"type":"deck"|"habit"|"activity","title": string,"why": string,"items": string[]}]} where suggest has at most one item and only when it would clearly help.',
  quizRules:
    'You write the result screen for a couples question game in the app Thirdwheel. You receive pairs of private answers. Rules: never quote, list or reveal either person\'s specific answer, never say who chose what, and never attribute a view to either person, including by name or by "you" versus "they". Speak about the couple as "you two". Talk in themes. No scores, percentages, labels or diagnoses. Return ONLY JSON: {"headline": string (max 8 words), "summary": string (2 sentences), "insights": [{"tone":"match"|"explore"|"growth","title": string (max 5 words),"text": string (1 to 2 sentences)}] (exactly 3), "tryThis": string (one concrete, small thing to do this week, 1 sentence)}',
};

export const ENV_DEFAULTS: AiSettingsInput = {
  provider: 'anthropic',
  anthropic: { model: 'anthropic-default', effort: 'low', refusalFallback: true },
  openai: { model: 'openai-default', temperature: null },
  fallbackOnly: false,
  prompts: { modes: Object.fromEntries(AI_MODES.map((m) => [m, null])), quizStyle: null },
};

export interface AiVersion {
  version: number;
  settings: AiSettingsInput;
  note: string | null;
  updatedBy: string | null;
  updatedByEmail: string | null;
  createdAt: string;
}

export interface AiState {
  keys: { anthropic: boolean; openai: boolean };
  versions: AiVersion[];
}

export const runtimeOf = (v: AiVersion): AiRuntimeSettings => ({
  version: v.version,
  ...structuredClone(v.settings),
  updatedAt: v.createdAt,
  updatedBy: v.updatedBy,
});

export function seedAi(): AiState {
  const lead = uid('lead');
  const v1: AiSettingsInput = structuredClone(ENV_DEFAULTS);
  const v2: AiSettingsInput = { ...structuredClone(v1), anthropic: { ...v1.anthropic, effort: 'medium' } };
  const v3: AiSettingsInput = structuredClone(v2);
  v3.prompts.modes.vent =
    'Listen. Reflect back what you heard in one or two sentences and ask one gentle, open question. No advice unless asked, and never a diagnosis.';
  v3.prompts.modes.heat = null;
  return {
    // The mock server has an Anthropic key and no OpenAI key, so the OpenAI choice shows its hint.
    keys: { anthropic: true, openai: false },
    versions: [
      {
        version: 1,
        settings: v1,
        note: 'First saved settings (environment defaults).',
        updatedBy: lead,
        updatedByEmail: 'lead@thirdwheel.app',
        createdAt: daysAgo(12),
      },
      {
        version: 2,
        settings: v2,
        note: 'Medium effort for better vent replies.',
        updatedBy: lead,
        updatedByEmail: 'lead@thirdwheel.app',
        createdAt: daysAgo(9),
      },
      {
        version: 3,
        settings: v3,
        note: 'Clinician wording for the vent task line.',
        updatedBy: lead,
        updatedByEmail: 'lead@thirdwheel.app',
        createdAt: daysAgo(5),
      },
    ],
  };
}
