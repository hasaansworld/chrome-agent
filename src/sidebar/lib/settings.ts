import {
  DEFAULT_MAX_STEPS,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  MAX_MAX_STEPS,
  MIN_MAX_STEPS,
  type ProviderId,
} from "../../shared/models";

const KEYS = {
  model: "selected_model",
  provider: "selected_provider",
  vision: "vision_enabled",
  maxSteps: "max_steps",
} as const;

function apiKeyStorageKey(provider: ProviderId): string {
  return `${provider}_api_key`;
}

export interface AppSettings {
  provider: ProviderId;
  model: string;
  vision: boolean;
  maxSteps: number;
  /** API key for the currently selected provider. */
  apiKey: string;
  /** All per-provider API keys (for UIs that display multiple). */
  apiKeys: Partial<Record<ProviderId, string>>;
}

export async function loadSettings(): Promise<AppSettings> {
  const stored = await chrome.storage.local.get([
    KEYS.model,
    KEYS.provider,
    KEYS.vision,
    KEYS.maxSteps,
    apiKeyStorageKey("anthropic"),
    apiKeyStorageKey("openai"),
    apiKeyStorageKey("google"),
    apiKeyStorageKey("groq"),
  ]);

  const provider =
    (stored[KEYS.provider] as ProviderId | undefined) ?? DEFAULT_PROVIDER;
  const apiKeys: Partial<Record<ProviderId, string>> = {
    anthropic: stored[apiKeyStorageKey("anthropic")] as string | undefined,
    openai: stored[apiKeyStorageKey("openai")] as string | undefined,
    google: stored[apiKeyStorageKey("google")] as string | undefined,
    groq: stored[apiKeyStorageKey("groq")] as string | undefined,
  };

  return {
    provider,
    model: (stored[KEYS.model] as string | undefined) ?? DEFAULT_MODEL,
    vision: (stored[KEYS.vision] as boolean | undefined) ?? true,
    maxSteps: clampMaxSteps(stored[KEYS.maxSteps] as number | undefined),
    apiKey: apiKeys[provider] ?? "",
    apiKeys,
  };
}

function clampMaxSteps(v: number | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_MAX_STEPS;
  return Math.min(MAX_MAX_STEPS, Math.max(MIN_MAX_STEPS, Math.floor(v)));
}

export async function saveApiKey(provider: ProviderId, key: string): Promise<void> {
  await chrome.storage.local.set({ [apiKeyStorageKey(provider)]: key.trim() });
}

export async function saveModel(model: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.model]: model });
}

export async function saveProvider(provider: ProviderId): Promise<void> {
  await chrome.storage.local.set({ [KEYS.provider]: provider });
}

export async function saveVision(vision: boolean): Promise<void> {
  await chrome.storage.local.set({ [KEYS.vision]: vision });
}

export async function saveMaxSteps(maxSteps: number): Promise<void> {
  await chrome.storage.local.set({ [KEYS.maxSteps]: clampMaxSteps(maxSteps) });
}

export interface SettingsChange {
  provider?: ProviderId;
  model?: string;
  vision?: boolean;
  maxSteps?: number;
  /** API key for any provider that just changed. */
  apiKeys?: Partial<Record<ProviderId, string>>;
}

export function watchSettings(cb: (changes: SettingsChange) => void): () => void {
  const handler = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: chrome.storage.AreaName
  ) => {
    if (area !== "local") return;
    const patch: SettingsChange = {};
    if (KEYS.provider in changes)
      patch.provider = (changes[KEYS.provider].newValue as ProviderId | undefined) ?? DEFAULT_PROVIDER;
    if (KEYS.model in changes)
      patch.model = (changes[KEYS.model].newValue as string | undefined) ?? DEFAULT_MODEL;
    if (KEYS.vision in changes)
      patch.vision = (changes[KEYS.vision].newValue as boolean | undefined) ?? true;
    if (KEYS.maxSteps in changes)
      patch.maxSteps = clampMaxSteps(changes[KEYS.maxSteps].newValue as number | undefined);

    const apiKeyPatch: Partial<Record<ProviderId, string>> = {};
    for (const p of ["anthropic", "openai", "google", "groq"] as const) {
      const k = apiKeyStorageKey(p);
      if (k in changes) apiKeyPatch[p] = (changes[k].newValue as string | undefined) ?? "";
    }
    if (Object.keys(apiKeyPatch).length > 0) patch.apiKeys = apiKeyPatch;

    if (Object.keys(patch).length) cb(patch);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
