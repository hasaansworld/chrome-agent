export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderOption {
  id: ProviderId;
  label: string;
  disabled?: boolean;
}

export type ProviderId = "anthropic" | "openai" | "google" | "groq";

export const PROVIDERS: ProviderOption[] = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "google", label: "Google", disabled: true },
  { id: "groq", label: "Groq", disabled: true },
];

export const MODELS_BY_PROVIDER: Record<ProviderId, ModelOption[]> = {
  anthropic: [
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
  ],
  openai: [
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 mini" },
    { id: "gpt-5.4-nano", label: "GPT-5.4 nano" },
    { id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
    { id: "gpt-5", label: "GPT-5" },
    { id: "gpt-5-mini", label: "GPT-5 mini" },
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { id: "o3-mini", label: "o3-mini (reasoning)" },
  ],
  google: [],
  groq: [],
};

export function getModelsFor(provider: ProviderId): ModelOption[] {
  return MODELS_BY_PROVIDER[provider] ?? [];
}

export function getDefaultModelFor(provider: ProviderId): string {
  const list = getModelsFor(provider);
  return list[0]?.id ?? "";
}

export function getModelLabel(provider: ProviderId, modelId: string): string {
  return getModelsFor(provider).find((m) => m.id === modelId)?.label ?? modelId;
}

export const DEFAULT_PROVIDER: ProviderId = "openai";
export const DEFAULT_MODEL = getDefaultModelFor(DEFAULT_PROVIDER);

export const DEFAULT_MAX_STEPS = 100;
export const MIN_MAX_STEPS = 1;
export const MAX_MAX_STEPS = 500;
