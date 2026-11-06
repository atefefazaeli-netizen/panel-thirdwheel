// DTOs for ADMIN_API.md › AI engine (libs/common ai-engine.contracts.ts AiRuntimeSettings).

export type AiProviderName = 'anthropic' | 'openai' | 'none';
export const PROVIDERS: readonly AiProviderName[] = ['anthropic', 'openai', 'none'];
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

export interface AiPrompts {
  modes: Record<string, string | null>;
  quizStyle: string | null;
}

export interface AiRuntimeSettings {
  version: number;
  provider: AiProviderName;
  anthropic: { model: string; effort: Effort; refusalFallback: boolean };
  openai: { model: string; temperature: number | null };
  fallbackOnly: boolean;
  prompts: AiPrompts;
  updatedAt: string;
  updatedBy: string | null;
}

export type AiSettingsInput = Omit<AiRuntimeSettings, 'version' | 'updatedAt' | 'updatedBy'>;

export interface AiSettingsView {
  current: AiRuntimeSettings;
  defaults: {
    provider: AiProviderName;
    anthropic: AiRuntimeSettings['anthropic'];
    openai: AiRuntimeSettings['openai'];
    prompts: { modes: Record<string, string>; quizStyle: string };
    supports?: { temperature: { anthropic: boolean; openai: boolean } };
  };
  keys: { anthropic: boolean; openai: boolean };
  modes: string[];
  locked: { chatRules: string; chatOutput: string; quizRules: string };
}

export interface AiSettingsHistoryEntry {
  version: number;
  updatedAt: string;
  updatedBy: string | null;
  updatedByEmail: string | null;
  updatedByName?: string | null;
  note: string | null;
  settings: AiRuntimeSettings;
}

export interface AiTestResult {
  source: 'ai' | 'fallback' | 'risk';
  reply: string;
  latencyMs: number;
  provider: string;
  model: string | null;
}
