import type { ChatMessage } from "../lib/types";
import { ToolCallCard } from "./ToolCallCard";

interface Props {
  message: ChatMessage;
}

export function Message({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div
      className={`group px-4 py-3 ${
        isUser ? "bg-bg-subtle/40" : ""
      } border-b border-border/40`}
    >
      <div className="flex items-start gap-3 max-w-3xl mx-auto">
        <div
          className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-xxs font-bold ${
            isUser
              ? "bg-bg-hover text-text-secondary"
              : "bg-gradient-to-br from-accent to-accent-hover text-black"
          }`}
        >
          {isUser ? "U" : "C"}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-xxs font-medium text-text-muted uppercase tracking-wider">
            {isUser ? "You" : "Assistant"}
          </div>
          {message.parts.map((part, idx) => {
            if (part.type === "text") {
              return (
                <div
                  key={idx}
                  className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed"
                >
                  {part.text}
                  {message.streaming &&
                    idx === message.parts.length - 1 &&
                    part.type === "text" && (
                      <span className="inline-block w-1.5 h-3.5 bg-accent ml-0.5 animate-pulse align-text-bottom" />
                    )}
                </div>
              );
            }
            const tool = message.toolInvocations.find((t) => t.id === part.toolId);
            if (!tool) return null;
            return <ToolCallCard key={idx} invocation={tool} />;
          })}
          {message.streaming &&
            message.parts.length === 0 &&
            !isUser && (
              <div className="text-text-muted text-xs dot-pulse pl-3" />
            )}
        </div>
      </div>
    </div>
  );
}
