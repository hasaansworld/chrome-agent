import { createConversation, runAgent } from "./agent";
import { PORT_NAME, type AgentEvent, type SidebarCommand } from "../shared/protocol";

// Open side panel on action click.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id != null) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (err) {
      console.error("Failed to open side panel:", err);
    }
  }
});

// Configure side panel + re-inject the content script into already-open
// tabs. Without this, tabs that were open when the extension was loaded
// or updated keep their (now-orphaned) old content script and can't
// receive messages — so things like the glow overlay silently stop
// working until the user manually reloads each tab.
chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn("setPanelBehavior:", err));

  await reinjectContentScriptsIntoOpenTabs();
});

chrome.runtime.onStartup.addListener(() => {
  void reinjectContentScriptsIntoOpenTabs();
});

async function reinjectContentScriptsIntoOpenTabs(): Promise<void> {
  const contentScripts = chrome.runtime.getManifest().content_scripts ?? [];
  if (contentScripts.length === 0) return;
  const tabs = await chrome.tabs.query({
    url: ["http://*/*", "https://*/*", "file:///*"],
  });
  for (const tab of tabs) {
    if (tab.id == null) continue;
    for (const script of contentScripts) {
      const files = script.js ?? [];
      if (files.length === 0) continue;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: script.all_frames ?? false },
          files,
        });
      } catch {
        // chrome:// URLs, the web store, tabs that just discarded, etc. —
        // failures here are expected and non-fatal.
      }
    }
  }
}

// One conversation per port (per sidebar instance).
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  const state = createConversation();
  let abortController: AbortController | null = null;

  const emit = (event: AgentEvent) => {
    try {
      port.postMessage(event);
    } catch {
      // port disconnected mid-run; ignore
    }
  };

  port.onMessage.addListener(async (msg: SidebarCommand) => {
    switch (msg.type) {
      case "user-message": {
        abortController = new AbortController();
        await runAgent(state, msg.content, emit, abortController.signal, {
          vision: msg.vision,
        });
        abortController = null;
        break;
      }
      case "stop":
        abortController?.abort();
        break;
      case "reset":
        state.messages = [];
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    abortController?.abort();
  });
});
