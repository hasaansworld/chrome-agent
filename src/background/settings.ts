import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../shared/models";

const KEY_API = "anthropic_api_key";
const KEY_MODEL = "selected_model";
const KEY_PROVIDER = "selected_provider";

export async function getApiKey(): Promise<string | undefined> {
  const stored = await chrome.storage.local.get(KEY_API);
  return stored?.[KEY_API] as string | undefined;
}

export async function setApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [KEY_API]: key });
}

export async function getSelectedModel(): Promise<string> {
  const stored = await chrome.storage.local.get(KEY_MODEL);
  return (stored?.[KEY_MODEL] as string | undefined) ?? DEFAULT_MODEL;
}

export async function getSelectedProvider(): Promise<string> {
  const stored = await chrome.storage.local.get(KEY_PROVIDER);
  return (stored?.[KEY_PROVIDER] as string | undefined) ?? DEFAULT_PROVIDER;
}
