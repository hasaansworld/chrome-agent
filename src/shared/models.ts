export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderOption {
  id: string;
  label: string;
  disabled?: boolean;
}

export const PROVIDERS: ProviderOption[] = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI", disabled: true },
  { id: "google", label: "Google", disabled: true },
  { id: "groq", label: "Groq", disabled: true },
];

export const MODELS: ModelOption[] = [
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
];

export const DEFAULT_MODEL = "claude-haiku-4-5";
export const DEFAULT_PROVIDER = "anthropic";
