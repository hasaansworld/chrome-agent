/**
 * Chrome DevTools Protocol helpers for dispatching *trusted* input events
 * that canvas-based editors (Google Docs, Figma, Monaco, etc.) actually
 * accept. Synthetic DOM events (`dispatchEvent(new KeyboardEvent(...))`)
 * have `isTrusted: false` and are ignored by these apps.
 *
 * Attaches to the active tab on demand, runs the command, and detaches
 * so the "controlled by automated software" banner only shows briefly.
 * Keeps a reference count so concurrent commands share one attachment.
 */

type DebuggeeTarget = { tabId: number };

const attached = new Map<number, number>(); // tabId -> refcount

async function attach(tabId: number): Promise<void> {
  const existing = attached.get(tabId);
  if (existing != null) {
    attached.set(tabId, existing + 1);
    return;
  }
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    attached.set(tabId, 1);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("already attached")) {
      attached.set(tabId, 1);
      return;
    }
    throw err;
  }
}

async function detach(tabId: number): Promise<void> {
  const count = attached.get(tabId);
  if (count == null) return;
  if (count > 1) {
    attached.set(tabId, count - 1);
    return;
  }
  attached.delete(tabId);
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    /* ignore — may already be detached by the user */
  }
}

async function withDebugger<T>(
  tabId: number,
  fn: (target: DebuggeeTarget) => Promise<T>
): Promise<T> {
  await attach(tabId);
  try {
    return await fn({ tabId });
  } finally {
    await detach(tabId);
  }
}

/**
 * Insert text at the current focus using CDP's Input.insertText. Works
 * in any editor that accepts OS-level input — including Google Docs,
 * Figma, and Monaco — because the event is delivered as a real,
 * trusted input event rather than a synthetic DOM event.
 *
 * The caller is responsible for ensuring the correct element has focus
 * (typically via a click first).
 */
export async function insertTextViaDebugger(
  tabId: number,
  text: string
): Promise<void> {
  await withDebugger(tabId, async (target) => {
    await chrome.debugger.sendCommand(target, "Input.insertText", { text });
  });
}

interface DispatchKeyOptions {
  /** Character to type when the key produces text (e.g. "a", " "). */
  text?: string;
  /** Modifier bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8. */
  modifiers?: number;
}

/**
 * Send a real key-press via CDP — useful for Enter/Tab/Escape/etc. in
 * canvas editors, or for shortcut keys (Ctrl+A, Cmd+K, ...).
 */
export async function pressKeyViaDebugger(
  tabId: number,
  key: string,
  options: DispatchKeyOptions = {}
): Promise<void> {
  const spec = KEY_SPECS[key] ?? inferKeySpec(key, options.text);
  await withDebugger(tabId, async (target) => {
    const common = {
      modifiers: options.modifiers ?? 0,
      key: spec.key,
      code: spec.code,
      windowsVirtualKeyCode: spec.keyCode,
      nativeVirtualKeyCode: spec.keyCode,
    };
    // rawKeyDown for non-character keys, keyDown for character keys.
    const downType = spec.isChar ? "keyDown" : "rawKeyDown";
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: downType,
      ...common,
      ...(spec.isChar && { text: options.text ?? spec.text }),
    });
    if (spec.isChar && (options.text ?? spec.text)) {
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        type: "char",
        ...common,
        text: options.text ?? spec.text,
        unmodifiedText: options.text ?? spec.text,
      });
    }
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
      type: "keyUp",
      ...common,
    });
  });
}

interface KeySpec {
  key: string;
  code: string;
  keyCode: number;
  isChar: boolean;
  text?: string;
}

const KEY_SPECS: Record<string, KeySpec> = {
  Enter: { key: "Enter", code: "Enter", keyCode: 13, isChar: true, text: "\r" },
  Tab: { key: "Tab", code: "Tab", keyCode: 9, isChar: false },
  Escape: { key: "Escape", code: "Escape", keyCode: 27, isChar: false },
  Backspace: { key: "Backspace", code: "Backspace", keyCode: 8, isChar: false },
  Delete: { key: "Delete", code: "Delete", keyCode: 46, isChar: false },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38, isChar: false },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40, isChar: false },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37, isChar: false },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39, isChar: false },
  Home: { key: "Home", code: "Home", keyCode: 36, isChar: false },
  End: { key: "End", code: "End", keyCode: 35, isChar: false },
  PageUp: { key: "PageUp", code: "PageUp", keyCode: 33, isChar: false },
  PageDown: { key: "PageDown", code: "PageDown", keyCode: 34, isChar: false },
  " ": { key: " ", code: "Space", keyCode: 32, isChar: true, text: " " },
  Space: { key: " ", code: "Space", keyCode: 32, isChar: true, text: " " },
};

function inferKeySpec(key: string, explicitText?: string): KeySpec {
  if (key.length === 1) {
    const upper = key.toUpperCase();
    const isLetter = /[A-Z]/.test(upper);
    const isDigit = /[0-9]/.test(upper);
    return {
      key,
      code: isLetter
        ? `Key${upper}`
        : isDigit
        ? `Digit${upper}`
        : upper,
      keyCode: upper.charCodeAt(0),
      isChar: true,
      text: explicitText ?? key,
    };
  }
  return { key, code: key, keyCode: 0, isChar: false };
}
