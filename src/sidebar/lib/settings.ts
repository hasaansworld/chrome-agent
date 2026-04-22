import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../../shared/models";

const KEYS = {
  apiKey: "anthropic_api_key",
  model: "selected_model",
  provider: "selected_provider",
  vision: "vision_enabled",
} as const;

export async function loadSettings() {
  const stored = await chrome.storage.local.get([
    KEYS.apiKey,
    KEYS.model,
    KEYS.provider,
    KEYS.vision,
  ]);
  return {
    apiKey: (stored[KEYS.apiKey] as string | undefined) ?? "",
    model: (stored[KEYS.model] as string | undefined) ?? DEFAULT_MODEL,
    provider: (stored[KEYS.provider] as string | undefined) ?? DEFAULT_PROVIDER,
    vision: (stored[KEYS.vision] as boolean | undefined) ?? true,
  };
}

export async function saveApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.apiKey]: key.trim() });
}

export async function saveModel(model: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.model]: model });
}

export async function saveProvider(provider: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.provider]: provider });
}

export async function saveVision(vision: boolean): Promise<void> {
  await chrome.storage.local.set({ [KEYS.vision]: vision });
}

export function watchSettings(
  cb: (changes: {
    apiKey?: string;
    model?: string;
    provider?: string;
    vision?: boolean;
  }) => void
): () => void {
  const handler = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: chrome.storage.AreaName
  ) => {
    if (area !== "local") return;
    const patch: {
      apiKey?: string;
      model?: string;
      provider?: string;
      vision?: boolean;
    } = {};
    if (KEYS.apiKey in changes) patch.apiKey = changes[KEYS.apiKey].newValue ?? "";
    if (KEYS.model in changes) patch.model = changes[KEYS.model].newValue ?? DEFAULT_MODEL;
    if (KEYS.provider in changes)
      patch.provider = changes[KEYS.provider].newValue ?? DEFAULT_PROVIDER;
    if (KEYS.vision in changes)
      patch.vision = changes[KEYS.vision].newValue ?? true;
    if (Object.keys(patch).length) cb(patch);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
