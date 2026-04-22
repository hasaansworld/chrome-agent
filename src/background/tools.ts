import { tool } from "ai";
import { z } from "zod";
import { sendToActiveTab, captureVisibleTab, getActiveTab } from "./tabs";
import type { InteractiveElement, PageContent } from "../shared/protocol";

// Rough size label used to hint the agent about the viewport size.
function describeImageSize(base64: string): string {
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes < 50_000) return "small";
  if (bytes < 200_000) return "medium";
  return "large";
}

// Screenshots captured by the agent that still need to be shown to the model
// as user-message image content. Keyed by toolCallId. Images are injected by
// the agent's prepareStep hook and then kept in history (they remain useful
// for follow-up turns). A cap prevents unbounded growth.
export interface PendingScreenshot {
  image: string; // raw base64 (no data: prefix)
  mediaType: string;
  url?: string;
  title?: string;
}

const MAX_PENDING_SCREENSHOTS = 4;
const pendingScreenshots = new Map<string, PendingScreenshot>();

export function getPendingScreenshots() {
  return pendingScreenshots;
}

function remember(toolCallId: string, shot: PendingScreenshot) {
  pendingScreenshots.set(toolCallId, shot);
  while (pendingScreenshots.size > MAX_PENDING_SCREENSHOTS) {
    const oldest = pendingScreenshots.keys().next().value as string | undefined;
    if (oldest == null) break;
    pendingScreenshots.delete(oldest);
  }
}

// Compact element rendering: one short line per element.
function renderElements(els: InteractiveElement[], start: number): string {
  return els
    .map((el, i) => {
      const n = start + i;
      const typeTag = el.type ? `[${el.type}]` : "";
      const text = el.text ? ` "${el.text.replace(/"/g, "'").slice(0, 60)}"` : "";
      // selector may be long — keep on same line but trim noise
      return `${n} ${el.tag}${typeTag}${text}  sel=${el.selector}`;
    })
    .join("\n");
}

export interface CreateToolsOptions {
  /** When false, omit the takeScreenshot tool entirely. */
  vision?: boolean;
}

export function createTools(options: CreateToolsOptions = {}) {
  const { vision = true } = options;

  const base = {

    getPageContent: tool({
      description:
        "Read the active tab's URL, title, and a compact list of visible interactive elements (tag, type, short text, CSS selector). Call this before acting on an unfamiliar page. By default returns up to 30 elements — pass a larger limit only if needed, or use offset to page through.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(120)
          .optional()
          .describe("Max number of interactive elements to return. Default 30."),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Skip the first N interactive elements. Default 0."),
        includeText: z
          .boolean()
          .optional()
          .describe(
            "If true, include a truncated (<=1500 chars) page text snippet. Default false — prefer searchHTML for specific text."
          ),
      }),
      execute: async ({ limit = 30, offset = 0, includeText = false }) => {
        const data = (await sendToActiveTab({
          type: "getPageContent",
          includeText,
        })) as PageContent;
        const total = data.interactiveElements.length;
        const slice = data.interactiveElements.slice(offset, offset + limit);
        const elementsText = renderElements(slice, offset) || "(none)";
        const textSnippet = includeText && data.textSnippet
          ? data.textSnippet.slice(0, 1500)
          : undefined;
        return {
          url: data.url,
          title: data.title,
          elementCount: total,
          shown: `${offset}..${offset + slice.length - 1}`,
          elements: elementsText,
          ...(textSnippet ? { textSnippet } : {}),
          ...(offset + slice.length < total
            ? { note: `${total - offset - slice.length} more elements available — call again with offset=${offset + slice.length} or use searchHTML.` }
            : {}),
        };
      },
    }),

    searchHTML: tool({
      description:
        "Run a CSS selector or ARIA role query against the active page. Mode 'css' runs querySelectorAll, 'role' finds elements with a matching [role=...] attribute. For finding elements by visible text/label, use findByText instead — it's more accurate.",
      inputSchema: z.object({
        query: z.string().describe("The search string (CSS selector or role name)."),
        mode: z.enum(["css", "role"]).describe("How to interpret the query."),
      }),
      execute: async ({ query, mode }) => {
        return await sendToActiveTab({ type: "searchHTML", query, mode });
      },
    }),

    findByText: tool({
      description:
        "Find elements whose visible text, aria-label, title, placeholder, alt, or input value matches a query. Walks the DOM and shadow roots, returns up to 50 results ordered interactive-first then deepest-first. Short queries (<=6 chars) default to whole-word matching so 'create' won't match 'recreate'. Each match includes a ready-to-use CSS selector, which field matched, and whether the element is interactive. Preferred way to locate a button/link/input by its label.",
      inputSchema: z.object({
        query: z.string().describe("Text to search for."),
        exact: z
          .boolean()
          .optional()
          .describe(
            "If true, require the element's source to equal the query (case-insensitive). Default false (substring)."
          ),
        wholeWord: z
          .boolean()
          .optional()
          .describe(
            "If true, require a word-boundary match ('create' won't match 'recreate'). Default: true for queries <=6 chars, false otherwise. Pass false explicitly when you want loose substring matching."
          ),
        tag: z
          .string()
          .optional()
          .describe("Only match elements with this tag name (e.g. 'button', 'a', 'input')."),
        role: z
          .string()
          .optional()
          .describe("Only match elements with this ARIA role (e.g. 'button', 'link', 'menuitem')."),
        interactiveOnly: z
          .boolean()
          .optional()
          .describe(
            "If true, only return clickable/typable elements (buttons, links, inputs, [role=button], etc.). Default false."
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max matches to return. Default 50."),
      }),
      execute: async ({ query, exact, wholeWord, tag, role, interactiveOnly, limit }) => {
        return await sendToActiveTab({
          type: "findByText",
          query,
          exact,
          wholeWord,
          tag,
          role,
          interactiveOnly,
          limit,
        });
      },
    }),

    clickElement: tool({
      description:
        "Click an element on the active tab, identified by a CSS selector. Prefer selectors returned by getPageContent or searchHTML.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector of the element to click."),
      }),
      execute: async ({ selector }) => {
        return await sendToActiveTab({ type: "click", selector });
      },
    }),

    fillInput: tool({
      description: "Fill an input or textarea (or contenteditable) with text. Focuses first, then types.",
      inputSchema: z.object({
        selector: z.string(),
        text: z.string(),
      }),
      execute: async ({ selector, text }) => {
        return await sendToActiveTab({ type: "fill", selector, text });
      },
    }),

    pressKey: tool({
      description:
        "Dispatch a keyboard event AND simulate its default action: Enter submits a form (on text inputs) or clicks a button/link; Space toggles checkboxes/buttons or inserts a space in inputs; single-char keys insert text into the focused input; Backspace/Delete edit input values; other keys (Escape, arrow keys, Tab) fire the event for page listeners to handle. If the element is not focused yet, it will be focused first.",
      inputSchema: z.object({
        key: z
          .string()
          .describe(
            "Key name. Use 'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', ' ' (space), or a single character like 'a' / '1' for typing."
          ),
        selector: z
          .string()
          .optional()
          .describe("CSS selector of the element. If omitted, dispatches to document.activeElement."),
      }),
      execute: async ({ key, selector }) => {
        return await sendToActiveTab({ type: "pressKey", key, selector });
      },
    }),

    scrollPage: tool({
      description: "Scroll the active tab by the given pixel amount in one direction.",
      inputSchema: z.object({
        direction: z.enum(["up", "down", "left", "right"]),
        amount: z.number().int().min(1).max(10000),
      }),
      execute: async ({ direction, amount }) => {
        return await sendToActiveTab({ type: "scroll", direction, amount });
      },
    }),

    runJavaScript: tool({
      description:
        "Execute a JavaScript expression in the active tab's page context and return its result. The last expression's value is returned (no 'return' keyword needed at top level). Keep code short and focused. Will JSON-serialize the result.",
      inputSchema: z.object({
        code: z.string().describe("JavaScript expression or statement(s)."),
      }),
      execute: async ({ code }) => {
        const tab = await getActiveTab();
        try {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            world: "MAIN",
            func: (src: string) => {
              try {
                // eslint-disable-next-line no-new-func
                const fn = new Function(`return (async () => { return (${src}); })();`);
                return Promise.resolve(fn()).then(
                  (value) => {
                    try {
                      return { ok: true, value: JSON.parse(JSON.stringify(value)) };
                    } catch {
                      return { ok: true, value: String(value) };
                    }
                  },
                  (err) => ({ ok: false, error: String(err) })
                );
              } catch (err) {
                return { ok: false, error: String(err) };
              }
            },
            args: [code],
          });
          const out = result?.result as
            | { ok: true; value: unknown }
            | { ok: false; error: string }
            | undefined;
          if (!out) return { ok: false, error: "No result" };
          if (!out.ok) return out;
          // Truncate very large results to keep the history manageable.
          const serialized = JSON.stringify(out.value);
          if (serialized.length > 4000) {
            return {
              ok: true,
              truncated: true,
              value: serialized.slice(0, 4000) + "…",
              note: `Result was ${serialized.length} chars; truncated to 4000.`,
            };
          }
          return out;
        } catch (err) {
          return { ok: false, error: String(err) };
        }
      },
    }),

    openTab: tool({
      description: "Open a new browser tab at the given URL.",
      inputSchema: z.object({ url: z.string().url() }),
      execute: async ({ url }) => {
        const tab = await chrome.tabs.create({ url });
        return { tabId: tab.id, url: tab.url ?? url };
      },
    }),

    closeTab: tool({
      description:
        "Close a browser tab by its numeric tabId (from openTab or listTabs). Use this to clean up any tabs you opened once their purpose is served.",
      inputSchema: z.object({
        tabId: z.number().int().describe("The numeric id of the tab to close."),
      }),
      execute: async ({ tabId }) => {
        try {
          await chrome.tabs.remove(tabId);
          return { ok: true };
        } catch (err) {
          return { ok: false, error: String(err) };
        }
      },
    }),

    navigate: tool({
      description: "Navigate the active tab to a new URL.",
      inputSchema: z.object({ url: z.string().url() }),
      execute: async ({ url }) => {
        const tab = await getActiveTab();
        await chrome.tabs.update(tab.id!, { url });
        return { ok: true };
      },
    }),

    switchTab: tool({
      description: "Switch to a specific tab by its numeric tabId (from listTabs).",
      inputSchema: z.object({ tabId: z.number().int() }),
      execute: async ({ tabId }) => {
        const tab = await chrome.tabs.get(tabId);
        await chrome.tabs.update(tabId, { active: true });
        if (tab.windowId != null) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
        return { ok: true };
      },
    }),

    listTabs: tool({
      description: "List all open browser tabs with id, url, and title.",
      inputSchema: z.object({}),
      execute: async () => {
        const tabs = await chrome.tabs.query({});
        return {
          tabs: tabs.map((t) => ({
            id: t.id,
            url: t.url,
            title: t.title,
            active: t.active,
          })),
        };
      },
    }),
  };

  if (!vision) {
    return base;
  }

  return {
    ...base,
    takeScreenshot: tool({
      description:
        "Capture a screenshot of the currently visible browser tab. The image is attached as a user message so you can see exactly what the user sees. Use this to visually confirm page state before/after actions.",
      inputSchema: z.object({}),
      execute: async (_, { toolCallId }) => {
        const tab = await getActiveTab();
        const image = await captureVisibleTab();
        const data = image.replace(/^data:image\/\w+;base64,/, "");
        remember(toolCallId, {
          image: data,
          mediaType: "image/png",
          url: tab.url,
          title: tab.title,
        });
        return {
          image: data,
          mediaType: "image/png",
          url: tab.url,
          title: tab.title,
          size: describeImageSize(data),
        };
      },
      // The model receives a short text tool result. The actual image is
      // injected into the conversation as a user-message image part by the
      // agent's prepareStep hook (see agent.ts) — this is the reliable
      // Anthropic image path.
      toModelOutput: ({ output }) => ({
        type: "content",
        value: [
          {
            type: "text",
            text: `Screenshot captured of "${output.title ?? "active tab"}" (${
              output.url ?? "unknown URL"
            }). The image is attached below as a user message so you can view it directly.`,
          },
        ],
      }),
    }),
  };
}

export type AgentTools = ReturnType<typeof createTools>;
