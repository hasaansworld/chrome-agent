export type ToolStatus = "running" | "done" | "error";

export interface ToolInvocation {
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
  error?: string;
  status: ToolStatus;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolInvocations: ToolInvocation[];
  /** Ordered timeline of parts for rendering. */
  parts: MessagePart[];
  /** Whether the assistant is still streaming this message. */
  streaming?: boolean;
}

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "tool"; toolId: string };
