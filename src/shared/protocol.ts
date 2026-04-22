// Messages between content script and service worker.
export type ContentRequest =
  | { type: "ping" }
  | { type: "getPageContent"; includeText?: boolean }
  | { type: "searchHTML"; query: string; mode: "css" | "role" }
  | {
      type: "findByText";
      query: string;
      exact?: boolean;
      tag?: string;
      role?: string;
      interactiveOnly?: boolean;
      limit?: number;
      wholeWord?: boolean;
    }
  | { type: "click"; selector: string }
  | { type: "fill"; selector: string; text: string }
  | { type: "pressKey"; selector?: string; key: string }
  | { type: "scroll"; direction: "up" | "down" | "left" | "right"; amount: number };

export interface InteractiveElement {
  idx: number;
  selector: string;
  tag: string;
  role?: string;
  text: string;
  type?: string;
  href?: string;
}

export interface PageContent {
  url: string;
  title: string;
  interactiveElements: InteractiveElement[];
  textSnippet?: string;
}

// Stream events from service worker to sidebar (via port).
export type AgentEvent =
  | { type: "text-delta"; id: string; delta: string }
  | { type: "tool-call"; id: string; name: string; args: unknown }
  | { type: "tool-result"; id: string; result: unknown; error?: string }
  | { type: "message-start"; id: string; role: "assistant" }
  | { type: "message-end"; id: string }
  | { type: "finish"; reason: string }
  | { type: "error"; message: string };

// Sidebar to SW commands (via port).
export type SidebarCommand =
  | { type: "user-message"; content: string; vision: boolean }
  | { type: "stop" }
  | { type: "reset" };

export const PORT_NAME = "agent-stream";
