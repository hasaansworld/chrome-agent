import { useEffect, useRef } from "react";
import type { ChatMessage } from "../lib/types";
import { Message } from "./Message";

interface Props {
  messages: ChatMessage[];
  error?: string | null;
}

export function ChatStream({ messages, error }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0 && !error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-black text-lg font-bold mb-4">
          C
        </div>
        <h2 className="text-base font-semibold text-text-primary mb-1.5">
          Browser automation agent
        </h2>
        <p className="text-xs text-text-secondary max-w-xs leading-relaxed">
          Ask me to read, click, fill, or navigate the active tab. I can take
          screenshots, run JavaScript, and switch between tabs.
        </p>
        <div className="mt-6 w-full max-w-xs space-y-1.5">
          {[
            "Summarize this page",
            "Take a screenshot and describe it",
            "Search my tabs for docs.google.com",
          ].map((s) => (
            <div
              key={s}
              className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-xs text-text-secondary"
            >
              {s}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.map((m) => (
        <Message key={m.id} message={m} />
      ))}
      {error && (
        <div className="mx-4 my-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
