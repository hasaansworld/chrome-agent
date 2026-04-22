import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_MAX_STEPS,
  MAX_MAX_STEPS,
  MIN_MAX_STEPS,
  PROVIDERS,
  getDefaultModelFor,
  getModelsFor,
  type ProviderId,
} from "../../shared/models";
import {
  loadSettings,
  saveApiKey,
  saveMaxSteps,
  saveModel,
  saveProvider,
} from "../lib/settings";
import { CheckIcon, EyeIcon, EyeOffIcon } from "./Icon";

const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  groq: "Groq",
};

const PROVIDER_KEY_LINK: Record<ProviderId, string> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/apikey",
  groq: "https://console.groq.com/keys",
};

export function Settings() {
  const [provider, setProvider] = useState<ProviderId>("anthropic");
  const [model, setModel] = useState("");
  const [maxSteps, setMaxStepsLocal] = useState(DEFAULT_MAX_STEPS);
  const [apiKeys, setApiKeys] = useState<Partial<Record<ProviderId, string>>>({});
  const [keyDraft, setKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setProvider(s.provider);
      setModel(s.model);
      setMaxStepsLocal(s.maxSteps);
      setApiKeys(s.apiKeys);
      setKeyDraft(s.apiKeys[s.provider] ?? "");
    });
  }, []);

  const models = useMemo(() => getModelsFor(provider), [provider]);
  const savedKey = apiKeys[provider] ?? "";
  const hasKey = savedKey.length > 0;
  const dirty = keyDraft !== savedKey;

  const onChangeProvider = async (next: ProviderId) => {
    setProvider(next);
    await saveProvider(next);
    // If the saved model isn't in the new provider's list, reset to its default.
    const allowed = getModelsFor(next).map((m) => m.id);
    if (!allowed.includes(model)) {
      const fallback = getDefaultModelFor(next);
      setModel(fallback);
      await saveModel(fallback);
    }
    setKeyDraft(apiKeys[next] ?? "");
    setShowKey(false);
  };

  const onChangeModel = async (id: string) => {
    setModel(id);
    await saveModel(id);
  };

  const onSaveKey = async () => {
    await saveApiKey(provider, keyDraft);
    setApiKeys((prev) => ({ ...prev, [provider]: keyDraft.trim() }));
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
  };

  const onChangeMaxSteps = async (raw: string) => {
    const n = parseInt(raw, 10);
    const v = Number.isFinite(n)
      ? Math.min(MAX_MAX_STEPS, Math.max(MIN_MAX_STEPS, n))
      : DEFAULT_MAX_STEPS;
    setMaxStepsLocal(v);
    await saveMaxSteps(v);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5">
      <div className="mx-auto max-w-md space-y-6">
        {/* Provider */}
        <div>
          <label className="field-label">Provider</label>
          <select
            className="field-select"
            value={provider}
            onChange={(e) => onChangeProvider(e.target.value as ProviderId)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id} disabled={p.disabled}>
                {p.label}
                {p.disabled ? " (coming soon)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div>
          <label className="field-label">Model</label>
          <select
            className="field-select"
            value={model}
            onChange={(e) => onChangeModel(e.target.value)}
            disabled={models.length === 0}
          >
            {models.length === 0 ? (
              <option>No models available</option>
            ) : (
              models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))
            )}
          </select>
        </div>

        {/* API key (scoped to current provider) */}
        <div>
          <label className="field-label">
            {PROVIDER_LABEL[provider]} API Key
          </label>
          <div className="relative">
            <input
              className="field-input pr-20 font-mono"
              type={showKey ? "text" : "password"}
              placeholder={provider === "openai" ? "sk-..." : "sk-ant-..."}
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 btn-ghost !py-1 !px-1.5"
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? (
                <EyeOffIcon className="h-4 w-4" />
              ) : (
                <EyeIcon className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xxs">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  hasKey ? "bg-emerald-400" : "bg-text-muted"
                }`}
              />
              <span className="text-text-muted">
                {hasKey ? "Key saved" : "No key set"}
              </span>
            </div>
            <button
              className="btn-primary"
              onClick={onSaveKey}
              disabled={!dirty || !keyDraft.trim()}
            >
              {justSaved ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5" /> Saved
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>

          <p className="mt-3 text-xxs text-text-muted">
            Get an API key at{" "}
            <a
              href={PROVIDER_KEY_LINK[provider]}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {new URL(PROVIDER_KEY_LINK[provider]).host}
            </a>
            . It is stored locally in this browser only.
          </p>
        </div>

        {/* Max steps */}
        <div>
          <label className="field-label">Max steps per run</label>
          <input
            className="field-input"
            type="number"
            min={MIN_MAX_STEPS}
            max={MAX_MAX_STEPS}
            value={maxSteps}
            onChange={(e) => onChangeMaxSteps(e.target.value)}
          />
          <p className="mt-1.5 text-xxs text-text-muted">
            How many tool-calling rounds the agent may take before it stops.
            Default {DEFAULT_MAX_STEPS}. Range {MIN_MAX_STEPS}–{MAX_MAX_STEPS}.
          </p>
        </div>
      </div>
    </div>
  );
}
