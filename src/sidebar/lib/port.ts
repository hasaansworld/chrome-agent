import { PORT_NAME, type AgentEvent, type SidebarCommand } from "../../shared/protocol";

export function connectAgent(onEvent: (ev: AgentEvent) => void): {
  send: (cmd: SidebarCommand) => void;
  disconnect: () => void;
} {
  let port = chrome.runtime.connect({ name: PORT_NAME });

  const attach = () => {
    port.onMessage.addListener(onEvent);
    port.onDisconnect.addListener(() => {
      // Reconnect transparently (service worker may have been suspended).
      setTimeout(() => {
        try {
          port = chrome.runtime.connect({ name: PORT_NAME });
          attach();
        } catch {
          /* give up */
        }
      }, 250);
    });
  };
  attach();

  return {
    send: (cmd) => port.postMessage(cmd),
    disconnect: () => port.disconnect(),
  };
}
