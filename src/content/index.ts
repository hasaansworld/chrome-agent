import {
  extractInteractiveElements,
  queryBySelector,
  searchByRole,
  scrollBy,
  dispatchClick,
  setInputValue,
  pressKeyOn,
  buildSelector,
  findByText,
} from "./dom";
import type { ContentRequest } from "../shared/protocol";

function handle(req: ContentRequest): unknown {
  switch (req.type) {
    case "ping":
      return { ok: true };

    case "getPageContent": {
      const interactiveElements = extractInteractiveElements();
      const textSnippet = req.includeText
        ? document.body.innerText?.slice(0, 4000) ?? ""
        : undefined;
      return {
        url: location.href,
        title: document.title,
        interactiveElements,
        textSnippet,
      };
    }

    case "searchHTML": {
      const { query, mode } = req;
      let elements: Element[] = [];
      if (mode === "css") {
        try {
          elements = Array.from(document.querySelectorAll(query)).slice(0, 50);
        } catch (e) {
          return { matches: [], error: String(e) };
        }
      } else {
        elements = searchByRole(query);
      }
      return {
        matches: elements.map((el) => ({
          selector: buildSelector(el),
          tag: el.tagName.toLowerCase(),
          text: ((el as HTMLElement).innerText || "").trim().slice(0, 160),
        })),
      };
    }

    case "findByText": {
      const { query, exact, tag, role, interactiveOnly, limit, wholeWord } = req;
      try {
        return {
          matches: findByText({
            query,
            exact,
            tag,
            role,
            interactiveOnly,
            limit,
            wholeWord,
          }),
        };
      } catch (e) {
        return { matches: [], error: String(e) };
      }
    }

    case "click": {
      const el = queryBySelector(req.selector);
      if (!el) return { ok: false, error: `No element matches ${req.selector}` };
      dispatchClick(el);
      return { ok: true };
    }

    case "fill": {
      const el = queryBySelector(req.selector);
      if (!el) return { ok: false, error: `No element matches ${req.selector}` };
      el.focus?.();
      const result = setInputValue(el, req.text, { method: req.method });
      if (result.method === "none") {
        return {
          ok: false,
          error:
            "Could not insert text — tried execCommand, synthetic paste, beforeinput, and textContent. " +
            "The element may not accept programmatic input (e.g., some fully custom canvas editors).",
        };
      }
      return { ok: true, method: result.method };
    }

    case "pressKey": {
      const el = req.selector ? queryBySelector(req.selector) : null;
      if (req.selector && !el) return { ok: false, error: `No element matches ${req.selector}` };
      return pressKeyOn(el, req.key);
    }

    case "scroll": {
      scrollBy(req.direction, req.amount);
      return { ok: true };
    }

    case "setGlow": {
      setGlow(req.enabled);
      return { ok: true };
    }

    default:
      return { ok: false, error: "unknown request" };
  }
}

// --- Active-agent glow overlay -------------------------------------------

const GLOW_ID = "__chat-assistant-agent-glow__";
const GLOW_STYLE_ID = GLOW_ID + "-style";

const GLOW_KEYFRAMES = `
  @keyframes __ca_glow_cycle {
    0%, 100% {
      box-shadow:
        inset 0 0 0 3px rgba(99, 102, 241, 0.55),
        inset 0 0 32px rgba(99, 102, 241, 0.32),
        inset 0 0 96px rgba(99, 102, 241, 0.18);
    }
    33% {
      box-shadow:
        inset 0 0 0 3px rgba(168, 85, 247, 0.55),
        inset 0 0 32px rgba(168, 85, 247, 0.32),
        inset 0 0 96px rgba(168, 85, 247, 0.18);
    }
    66% {
      box-shadow:
        inset 0 0 0 3px rgba(14, 165, 233, 0.55),
        inset 0 0 32px rgba(14, 165, 233, 0.32),
        inset 0 0 96px rgba(14, 165, 233, 0.18);
    }
  }
`;

function setGlow(enabled: boolean): void {
  const existingOverlay = document.getElementById(GLOW_ID);
  const existingStyle = document.getElementById(GLOW_STYLE_ID);
  if (!enabled) {
    existingOverlay?.remove();
    existingStyle?.remove();
    return;
  }

  // Re-inject fresh styles every time. If an older version of this script
  // left a stale <style> here (e.g. the extension was reloaded and the
  // keyframe name has since changed), replacing ensures the animation
  // actually resolves instead of silently being a no-op.
  existingStyle?.remove();
  const style = document.createElement("style");
  style.id = GLOW_STYLE_ID;
  style.textContent = GLOW_KEYFRAMES;
  document.documentElement.appendChild(style);

  // Same for the overlay — drop any leftover and create a fresh one.
  existingOverlay?.remove();
  const overlay = document.createElement("div");
  overlay.id = GLOW_ID;
  // Also set a static box-shadow matching the first keyframe stop so the
  // glow is visible *immediately* and stays visible even if the animation
  // fails to start for any reason (strict CSP, paused tabs, etc.).
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "2147483647",
    borderRadius: "0",
    transition: "opacity 240ms ease-out",
    boxShadow:
      "inset 0 0 0 3px rgba(99, 102, 241, 0.55), " +
      "inset 0 0 32px rgba(99, 102, 241, 0.32), " +
      "inset 0 0 96px rgba(99, 102, 241, 0.18)",
    animation: "__ca_glow_cycle 6s ease-in-out infinite",
  } as CSSStyleDeclaration);
  document.documentElement.appendChild(overlay);
}

chrome.runtime.onMessage.addListener((message: ContentRequest, _sender, sendResponse) => {
  try {
    const result = handle(message);
    sendResponse(result);
  } catch (err) {
    sendResponse({ ok: false, error: String(err) });
  }
  return false; // synchronous
});
