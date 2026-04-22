import {
  DEFAULT_MAX_STEPS,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  MAX_MAX_STEPS,
  MIN_MAX_STEPS,
  type ProviderId,
} from "../shared/models";

const KEY_MODEL = "selected_model";
const KEY_PROVIDER = "selected_provider";
const KEY_MAX_STEPS = "max_steps";

function apiKeyStorageKey(provider: ProviderId): string {
  return `${provider}_api_key`;
}

export async function getApiKey(provider: ProviderId): Promise<string | undefined> {
  const storageKey = apiKeyStorageKey(provider);
  const stored = await chrome.storage.local.get(storageKey);
  return stored?.[storageKey] as string | undefined;
}

export async function setApiKey(provider: ProviderId, key: string): Promise<void> {
  await chrome.storage.local.set({ [apiKeyStorageKey(provider)]: key });
}

export async function getSelectedModel(): Promise<string> {
  const stored = await chrome.storage.local.get(KEY_MODEL);
  return (stored?.[KEY_MODEL] as string | undefined) ?? DEFAULT_MODEL;
}

export async function getSelectedProvider(): Promise<ProviderId> {
  const stored = await chrome.storage.local.get(KEY_PROVIDER);
  return (stored?.[KEY_PROVIDER] as ProviderId | undefined) ?? DEFAULT_PROVIDER;
}

export async function getMaxSteps(): Promise<number> {
  const stored = await chrome.storage.local.get(KEY_MAX_STEPS);
  const v = stored?.[KEY_MAX_STEPS] as number | undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_MAX_STEPS;
  return Math.min(MAX_MAX_STEPS, Math.max(MIN_MAX_STEPS, Math.floor(v)));
}
