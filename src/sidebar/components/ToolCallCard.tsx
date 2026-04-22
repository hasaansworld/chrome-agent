import { useState } from "react";
import type { ToolInvocation } from "../lib/types";
import { ChevronDownIcon, ChevronRightIcon, WrenchIcon } from "./Icon";

interface Props {
  invocation: ToolInvocation;
}

function summarize(name: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  switch (name) {
    case "clickElement":
    case "fillInput":
    case "pressKey":
      return String(a.selector ?? a.key ?? "");
    case "navigate":
    case "openTab":
      return String(a.url ?? "");
    case "searchHTML":
      return `${a.mode}: ${a.query}`;
    case "scrollPage":
      return `${a.direction} ${a.amount}px`;
    case "runJavaScript":
      return String(a.code ?? "").slice(0, 60);
    case "switchTab":
      return `tab ${a.tabId}`;
    default:
      return "";
  }
}

function StatusDot({ status }: { status: ToolInvocation["status"] }) {
  const color =
    status === "done"
      ? "bg-emerald-400"
      : status === "error"
      ? "bg-rose-400"
      : "bg-amber-400";
  const animate = status === "running" ? "animate-pulse" : "";
  return <span className={`h-1.5 w-1.5 rounded-full ${color} ${animate}`} />;
}

export function ToolCallCard({ invocation }: Props) {
  const [open, setOpen] = useState(false);
  const summary = summarize(invocation.name, invocation.args);

  // For screenshot results, show the image inline.
  const screenshotB64: string | null =
    invocation.name === "takeScreenshot" &&
    invocation.result &&
    typeof invocation.result === "object" &&
    typeof (invocation.result as { image?: unknown }).image === "string"
      ? (invocation.result as { image: string }).image
      : null;

  return (
    <div className="my-1.5 rounded-md border border-border bg-bg-subtle overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-bg-hover transition"
      >
        <StatusDot status={invocation.status} />
        <WrenchIcon className="h-3.5 w-3.5 text-text-muted shrink-0" />
        <span className="font-mono text-xs text-text-primary shrink-0">
          {invocation.name}
        </span>
        {summary && (
          <span className="font-mono text-xxs text-text-muted truncate">
            {summary}
          </span>
        )}
        <span className="ml-auto text-text-muted">
          {open ? (
            <ChevronDownIcon className="h-3.5 w-3.5" />
          ) : (
            <ChevronRightIcon className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-2.5 py-2 space-y-2">
          <div>
            <div className="text-xxs uppercase tracking-wider text-text-muted mb-1">
              Arguments
            </div>
            <pre className="font-mono text-xxs text-text-secondary whitespace-pre-wrap break-all">
              {JSON.stringify(invocation.args, null, 2)}
            </pre>
          </div>

          {screenshotB64 ? (
            <div>
              <div className="text-xxs uppercase tracking-wider text-text-muted mb-1">
                Screenshot
              </div>
              <img
                src={
                  screenshotB64.startsWith("data:")
                    ? screenshotB64
                    : `data:image/png;base64,${screenshotB64}`
                }
                alt="screenshot"
                className="max-w-full rounded border border-border"
              />
            </div>
          ) : invocation.result !== undefined && !invocation.error ? (
            <div>
              <div className="text-xxs uppercase tracking-wider text-text-muted mb-1">
                Result
              </div>
              <pre className="font-mono text-xxs text-text-secondary whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                {JSON.stringify(invocation.result, null, 2)}
              </pre>
            </div>
          ) : null}

          {invocation.error && (
            <div>
              <div className="text-xxs uppercase tracking-wider text-rose-400 mb-1">
                Error
              </div>
              <pre className="font-mono text-xxs text-rose-300 whitespace-pre-wrap break-all">
                {invocation.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
