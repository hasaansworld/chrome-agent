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
      setInputValue(el, req.text);
      return { ok: true };
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

    default:
      return { ok: false, error: "unknown request" };
  }
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
