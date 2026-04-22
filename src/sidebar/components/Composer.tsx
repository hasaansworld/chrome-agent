import { useEffect, useRef, type KeyboardEvent } from "react";
import { SendIcon, StopIcon, EyeIcon, EyeOffIcon } from "./Icon";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  vision: boolean;
  onVisionChange: (v: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
}

// Stable, minimum textarea height in pixels. Keeps the composer the same
// visual size when empty vs. after the user starts typing a short line.
const MIN_TEXTAREA_HEIGHT = 44;
const MAX_TEXTAREA_HEIGHT = 160;

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  vision,
  onVisionChange,
  disabled,
  placeholder,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.min(
      Math.max(ta.scrollHeight, MIN_TEXTAREA_HEIGHT),
      MAX_TEXTAREA_HEIGHT
    );
    ta.style.height = `${next}px`;
  }, [value]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!busy && value.trim()) onSend();
    }
  };

  return (
    <div className="border-t border-border bg-bg px-3 py-2.5">
      <div className="relative rounded-lg border border-border bg-bg-subtle focus-within:border-border-strong transition">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={placeholder ?? "Ask me to do something on this tab..."}
          disabled={disabled}
          style={{ height: MIN_TEXTAREA_HEIGHT }}
          className="w-full resize-none bg-transparent px-3 pt-2.5 pb-9 text-sm text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-50 leading-5"
        />

        {/* Bottom toolbar inside the composer */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-1.5 py-1">
          <button
            type="button"
            role="switch"
            aria-checked={vision}
            onClick={() => onVisionChange(!vision)}
            title={
              vision
                ? "Vision on — agent can take screenshots"
                : "Vision off — no screenshot tool"
            }
            className={`group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xxs font-medium transition ${
              vision
                ? "bg-accent/15 text-accent hover:bg-accent/25"
                : "text-text-muted hover:bg-bg-hover"
            }`}
          >
            {vision ? (
              <EyeIcon className="h-3.5 w-3.5" />
            ) : (
              <EyeOffIcon className="h-3.5 w-3.5" />
            )}
            <span>Vision</span>
          </button>

          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="rounded-md bg-rose-500/90 hover:bg-rose-500 text-white h-7 w-7 flex items-center justify-center transition"
              aria-label="Stop"
              title="Stop"
            >
              <StopIcon className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={disabled || !value.trim()}
              className="rounded-md bg-accent hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed text-black h-7 w-7 flex items-center justify-center transition"
              aria-label="Send"
              title="Send (Enter)"
            >
              <SendIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xxs text-text-muted px-1">
        <span>Enter to send · Shift+Enter for newline</span>
      </div>
    </div>
  );
}
