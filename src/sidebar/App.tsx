import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Header } from "./components/Header";
import { ChatStream } from "./components/ChatStream";
import { Composer } from "./components/Composer";
import { Settings } from "./components/Settings";
import { connectAgent } from "./lib/port";
import type { ChatMessage, ToolInvocation } from "./lib/types";
import { loadSettings, saveVision, watchSettings } from "./lib/settings";
import type { AgentEvent } from "../shared/protocol";
import { DEFAULT_PROVIDER, type ProviderId } from "../shared/models";

type View = "chat" | "settings";

export default function App() {
  const [view, setView] = useState<View>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_PROVIDER);
  const [apiKeys, setApiKeys] = useState<Partial<Record<ProviderId, string>>>({});
  const [model, setModel] = useState("");
  const [vision, setVision] = useState(true);
  const agentRef = useRef<ReturnType<typeof connectAgent> | null>(null);

  const apiKey = apiKeys[provider] ?? "";

  // Load settings initially + listen for changes.
  useEffect(() => {
    loadSettings().then((s) => {
      setProvider(s.provider);
      setApiKeys(s.apiKeys);
      setModel(s.model);
      setVision(s.vision);
    });
    return watchSettings((patch) => {
      if (patch.provider !== undefined) setProvider(patch.provider);
      if (patch.model !== undefined) setModel(patch.model);
      if (patch.vision !== undefined) setVision(patch.vision);
      if (patch.apiKeys) {
        setApiKeys((prev) => ({ ...prev, ...patch.apiKeys }));
      }
    });
  }, []);

  const onVisionChange = useCallback((v: boolean) => {
    setVision(v);
    void saveVision(v);
  }, []);

  const onEvent = useCallback((ev: AgentEvent) => {
    switch (ev.type) {
      case "message-start":
        setMessages((prev) => [
          ...prev,
          {
            id: ev.id,
            role: "assistant",
            content: "",
            toolInvocations: [],
            parts: [],
            streaming: true,
          },
        ]);
        break;

      case "text-delta":
        setMessages((prev) => prev.map((m) => {
          if (m.id !== ev.id) return m;
          const parts = [...m.parts];
          const last = parts[parts.length - 1];
          if (last && last.type === "text") {
            parts[parts.length - 1] = { type: "text", text: last.text + ev.delta };
          } else {
            parts.push({ type: "text", text: ev.delta });
          }
          return { ...m, parts, content: m.content + ev.delta };
        }));
        break;

      case "tool-call":
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.role !== "assistant") return prev;
          const invocation: ToolInvocation = {
            id: ev.id,
            name: ev.name,
            args: ev.args,
            status: "running",
          };
          const updated: ChatMessage = {
            ...last,
            toolInvocations: [...last.toolInvocations, invocation],
            parts: [...last.parts, { type: "tool", toolId: ev.id }],
          };
          return [...prev.slice(0, -1), updated];
        });
        break;

      case "tool-result":
        setMessages((prev) => prev.map((m) => {
          const idx = m.toolInvocations.findIndex((t) => t.id === ev.id);
          if (idx === -1) return m;
          const next = [...m.toolInvocations];
          next[idx] = {
            ...next[idx],
            result: ev.result,
            error: ev.error,
            status: ev.error ? "error" : "done",
          };
          return { ...m, toolInvocations: next };
        }));
        break;

      case "message-end":
        setMessages((prev) => prev.map((m) => (m.id === ev.id ? { ...m, streaming: false } : m)));
        break;

      case "finish":
        setBusy(false);
        setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
        break;

      case "error":
        setError(ev.message);
        setBusy(false);
        setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
        break;
    }
  }, []);

  // Persistent port connection.
  useEffect(() => {
    agentRef.current = connectAgent(onEvent);
    return () => agentRef.current?.disconnect();
  }, [onEvent]);

  const onSend = useCallback(() => {
    const content = input.trim();
    if (!content || busy) return;
    if (!apiKey) {
      setError("No API key configured. Open settings to add one.");
      setView("settings");
      return;
    }
    setError(null);
    setInput("");
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content,
        toolInvocations: [],
        parts: [{ type: "text", text: content }],
      },
    ]);
    agentRef.current?.send({ type: "user-message", content, vision });
  }, [input, busy, apiKey, vision]);

  const onStop = useCallback(() => {
    agentRef.current?.send({ type: "stop" });
  }, []);

  const openSettings = useCallback(() => setView("settings"), []);
  const backToChat = useCallback(() => setView("chat"), []);

  const placeholder = useMemo(() => {
    if (!apiKey) return "Add an API key in settings to get started…";
    return undefined;
  }, [apiKey]);

  return (
    <div className="flex h-full w-full flex-col bg-bg">
      <Header
        view={view}
        provider={provider}
        model={model}
        onOpenSettings={openSettings}
        onBack={backToChat}
      />
      {view === "settings" ? (
        <Settings />
      ) : (
        <>
          <ChatStream messages={messages} error={error} />
          <Composer
            value={input}
            onChange={setInput}
            onSend={onSend}
            onStop={onStop}
            busy={busy}
            vision={vision}
            onVisionChange={onVisionChange}
            disabled={!apiKey}
            placeholder={placeholder}
          />
        </>
      )}
    </div>
  );
}
