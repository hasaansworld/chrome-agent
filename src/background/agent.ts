import { streamText, stepCountIs, type ModelMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createTools, getPendingScreenshots, type PendingScreenshot } from "./tools";
import { getApiKey, getSelectedModel } from "./settings";
import type { AgentEvent } from "../shared/protocol";

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
- runJavaScript is for data extraction or complex DOM reads. Don't use it for clicks or scrolling.

Finishing a task:
${finishingRules}

Replies:
- Narrate briefly (one short sentence) before tool calls. Summarize concisely when done.`;
}

export interface ConversationState {
  messages: ModelMessage[];
}

export function createConversation(): ConversationState {
  return { messages: [] };
}

/**
 * Walk a message list and, wherever a tool-result matches a pending screenshot
 * toolCallId, insert a user-role image message immediately after. Idempotent
 * when called with disjoint `pending` entries — callers typically clear the
 * map after persisting so entries aren't re-injected across turns.
 */
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
  const apiKey = await getApiKey();
  if (!apiKey) {
    emit({
      type: "error",
      message: "No Anthropic API key configured. Open settings and paste your key.",
    });
    return;
  }

  const modelId = await getSelectedModel();
  const pending = getPendingScreenshots();

  const anthropic = createAnthropic({
    apiKey,
    headers: {
      "anthropic-dangerous-direct-browser-access": "true",
    },
  });

  state.messages.push({ role: "user", content: userContent });

  const messageId = crypto.randomUUID();
  emit({ type: "message-start", id: messageId, role: "assistant" });

  try {
    const result = streamText({
      model: anthropic(modelId),
      system: buildSystemPrompt(options.vision),
      messages: state.messages,
      tools: createTools({ vision: options.vision }),
      stopWhen: stepCountIs(20),
      abortSignal,
      // Before each inner step, re-walk the SDK's accumulated messages and
      // insert any pending screenshots as user-role image parts right after
      // their tool_result. This is the reliable path for images on Anthropic.
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
          emit({ type: "error", message: String(part.error ?? "unknown error") });
          break;
        case "finish":
          emit({ type: "finish", reason: part.finishReason ?? "stop" });
          break;
        default:
          break;
      }
    }

    // Persist this turn's messages. Inject screenshots into the response
    // messages too so future turns keep the image in scrollback.
    const response = await result.response;
    if (response?.messages) {
      const persisted = injectScreenshots(
        response.messages as ModelMessage[],
        pending
      );
      state.messages.push(...persisted);
    }
    // Keep the pending map tidy — entries we persisted no longer need to be
    // re-injected by prepareStep on subsequent turns.
    pending.clear();

    emit({ type: "message-end", id: messageId });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      emit({ type: "finish", reason: "abort" });
    } else {
      emit({ type: "error", message: (err as Error).message ?? String(err) });
    }
  }
}
