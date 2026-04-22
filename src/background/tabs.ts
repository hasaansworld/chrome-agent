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

/**
 * Broadcast a content-script message to every tab that can receive it.
 * Errors are swallowed per-tab (chrome://, the web store, tabs without the
 * content script loaded, etc. will always fail and that's fine).
 */
export async function broadcastToAllTabs(req: ContentRequest): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (t) => {
      if (t.id == null) return;
      try {
        await chrome.tabs.sendMessage(t.id, req);
      } catch {
        /* tab can't receive messages — ignore */
      }
    })
  );
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
