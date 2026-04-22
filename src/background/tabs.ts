import type { ContentRequest } from "../shared/protocol";

export async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || tab.id == null) {
    throw new Error("No active tab.");
  }
  return tab;
}

export async function sendToActiveTab<T = unknown>(req: ContentRequest): Promise<T> {
  const tab = await getActiveTab();
  try {
    return (await chrome.tabs.sendMessage(tab.id!, req)) as T;
  } catch (err) {
    throw new Error(
      `Could not reach content script on ${tab.url}. ${
        (err as Error).message ?? ""
      } (The page may be a chrome:// URL or not yet loaded.)`
    );
  }
}

export async function captureVisibleTab(): Promise<string> {
  const tab = await getActiveTab();
  // Ensure window is focused (captureVisibleTab requires focused window).
  if (tab.windowId != null) {
    try {
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch {
      /* ignore */
    }
  }
  return await chrome.tabs.captureVisibleTab(tab.windowId!, {
    format: "png",
    quality: 90,
  });
}
