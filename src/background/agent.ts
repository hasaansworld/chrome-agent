import {
  streamText,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createTools, getPendingScreenshots, type PendingScreenshot } from "./tools";
import {
  getApiKey,
  getMaxSteps,
  getSelectedModel,
  getSelectedProvider,
} from "./settings";
import { broadcastToAllTabs } from "./tabs";
import type { AgentEvent } from "../shared/protocol";
import type { ProviderId } from "../shared/models";

function buildSystemPrompt(vision: boolean): string {
  const visionRecon = vision
    ? "- takeScreenshot attaches the actual image of the tab as a user message so you can see pixels. Use it when visual layout matters — otherwise prefer DOM-based tools for cheaper, more precise recon."
    : "- Screenshot / visual inspection is disabled by the user. Rely on DOM-based tools (findByText, getPageContent, searchHTML, runJavaScript).";

  const finishingRules = [
    "- When the task is complete, close every tab that you opened with openTab — use closeTab(tabId) for each. If the user's task was to open a tab and leave it open, skip this cleanup (say so).",
    vision
      ? "- Before you declare the task complete, call takeScreenshot once to verify the end result visually. Make sure what you see matches what the user asked for."
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are a browser automation assistant running inside a Chrome extension side panel. You have tools to inspect and control the user's active browser tab.

Be efficient with tokens. Start small and only gather more detail when you need it.

Recon strategy:
- To find an element by its visible label (button text, link text, input placeholder, aria-label, title, alt, or value) use **findByText** — it's the most reliable path. Filter with tag/role/interactiveOnly to narrow results. Matches are deduped so a button wrapping a span only appears once.
- getPageContent returns a compact list of visible interactive elements. Useful for "what can I interact with on this page?" Start with 30 results; page through with offset if needed.
- searchHTML is for CSS selector or ARIA role queries when you know the structure.
${visionRecon}
- Set includeText on getPageContent only when you truly need body text.

Acting:
- Use CSS selectors returned by getPageContent/searchHTML — don't invent selectors.
- If a click or fill fails, try a different selector or a different search rather than repeating the same call.
- **Canvas-based editors** (Google Docs, Figma, Monaco/VSCode web): synthetic DOM events are ignored by these apps. ALWAYS use fillInput with method='debugger' (and pressKey with method='debugger' for Enter/Tab/arrows). The workflow: clickElement on the editor canvas to place the cursor, then fillInput({ method: 'debugger', text: '...' }). The debugger path dispatches real, trusted input events via Chrome DevTools Protocol. A yellow "controlled by automated software" banner may appear briefly — that's expected.
- runJavaScript is for data extraction or complex DOM reads. Don't use it for clicks or scrolling.

Finishing a task:
${finishingRules}

Replies:
- Narrate briefly (one short sentence) before tool calls. Summarize concisely when done.`;
}

function createModel(provider: ProviderId, apiKey: string, modelId: string): LanguageModel {
  switch (provider) {
    case "openai": {
      const openai = createOpenAI({ apiKey });
      // Force the Chat Completions API (.chat) instead of the default
      // Responses API. Chat Completions is the well-trodden path for
      // streaming tool calls and works identically from a browser
      // context. The Responses API streams tool calls in a different
      // shape that some AI SDK versions don't fully normalize yet.
      return openai.chat(modelId);
    }
    case "anthropic":
    default: {
      const anthropic = createAnthropic({
        apiKey,
        headers: {
          "anthropic-dangerous-direct-browser-access": "true",
        },
      });
      return anthropic(modelId);
    }
  }
}

export interface ConversationState {
  messages: ModelMessage[];
}

export function createConversation(): ConversationState {
  return { messages: [] };
}

function injectScreenshots(
  messages: ModelMessage[],
  pending: Map<string, PendingScreenshot>
): ModelMessage[] {
  if (pending.size === 0) return messages;

  const out: ModelMessage[] = [];
  for (const msg of messages) {
    out.push(msg);
    if (msg.role !== "tool") continue;
    if (!Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (part.type !== "tool-result") continue;
      const shot = pending.get(part.toolCallId);
      if (!shot) continue;
      out.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Screenshot from takeScreenshot (${part.toolCallId})${
              shot.title ? ` — ${shot.title}` : ""
            }${shot.url ? ` [${shot.url}]` : ""}:`,
          },
          {
            type: "image",
            image: shot.image,
            mediaType: shot.mediaType,
          },
        ],
      });
    }
  }
  return out;
}

export interface RunAgentOptions {
  vision: boolean;
}

export async function runAgent(
  state: ConversationState,
  userContent: string,
  emit: (event: AgentEvent) => void,
  abortSignal: AbortSignal,
  options: RunAgentOptions
): Promise<void> {
  const provider = await getSelectedProvider();
  const apiKey = await getApiKey(provider);
  if (!apiKey) {
    emit({
      type: "error",
      message: `No ${provider} API key configured. Open settings and paste your key.`,
    });
    return;
  }

  const modelId = await getSelectedModel();
  const maxSteps = await getMaxSteps();
  const pending = getPendingScreenshots();
  const model = createModel(provider, apiKey, modelId);

  state.messages.push({ role: "user", content: userContent });

  const messageId = crypto.randomUUID();
  emit({ type: "message-start", id: messageId, role: "assistant" });

  // Visual signal on every tab that the agent is working. Broadcasted
  // rather than targeted at a single tab so the glow follows whichever
  // tab the agent switches to mid-run.
  void broadcastToAllTabs({ type: "setGlow", enabled: true });

  try {
    const result = streamText({
      model,
      system: buildSystemPrompt(options.vision),
      messages: state.messages,
      tools: createTools({ vision: options.vision }),
      stopWhen: stepCountIs(maxSteps),
      abortSignal,
      prepareStep: async ({ messages }) => ({
        messages: injectScreenshots(messages, pending),
      }),
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          emit({ type: "text-delta", id: messageId, delta: part.text ?? "" });
          break;
        case "tool-call":
          emit({
            type: "tool-call",
            id: part.toolCallId,
            name: part.toolName,
            args: part.input,
          });
          break;
        case "tool-result":
          emit({
            type: "tool-result",
            id: part.toolCallId,
            result: part.output,
          });
          break;
        case "tool-error":
          emit({
            type: "tool-result",
            id: part.toolCallId,
            result: null,
            error: String(part.error ?? "tool error"),
          });
          break;
        case "error":
          console.error("[agent] stream error:", part.error);
          emit({ type: "error", message: describeError(part.error) });
          break;
        case "finish":
          emit({ type: "finish", reason: part.finishReason ?? "stop" });
          break;
        default:
          break;
      }
    }

    const response = await result.response;
    if (response?.messages) {
      const persisted = injectScreenshots(
        response.messages as ModelMessage[],
        pending
      );
      state.messages.push(...persisted);
    }
    pending.clear();

    emit({ type: "message-end", id: messageId });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      emit({ type: "finish", reason: "abort" });
    } else {
      console.error("[agent] thrown error:", err);
      emit({ type: "error", message: describeError(err) });
    }
  } finally {
    void broadcastToAllTabs({ type: "setGlow", enabled: false });
  }
}

/**
 * Turn AI SDK / provider errors into a single descriptive string that
 * includes HTTP status + the API response body (so "invalid model",
 * "invalid API key", "insufficient_quota", etc. surface in the UI).
 */
function describeError(err: unknown): string {
  if (err == null) return "Unknown error.";
  if (typeof err === "string") return err;

  const e = err as Record<string, unknown> & { message?: string; cause?: unknown };
  const parts: string[] = [];

  if (typeof e.message === "string") parts.push(e.message);

  const status = e.statusCode ?? e.status;
  if (typeof status === "number") parts.push(`HTTP ${status}`);

  const url = e.url;
  if (typeof url === "string") parts.push(url);

  const responseBody =
    typeof e.responseBody === "string"
      ? e.responseBody
      : e.data != null
      ? safeStringify(e.data)
      : undefined;
  if (responseBody) parts.push(`body: ${truncate(responseBody, 1500)}`);

  if (e.cause && e.cause !== err) {
    const nested = describeError(e.cause);
    if (nested && !parts.includes(nested)) parts.push(`cause: ${nested}`);
  }

  return parts.length > 0 ? parts.join(" — ") : safeStringify(err);
}

function safeStringify(v: unknown): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + `… (+${s.length - n} chars)` : s;
}
