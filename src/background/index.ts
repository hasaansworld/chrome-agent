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

// Configure side panel to show on all tabs.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn("setPanelBehavior:", err));
});

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
