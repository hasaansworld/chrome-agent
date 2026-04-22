import { useEffect, useState } from "react";
import { MODELS, PROVIDERS } from "../../shared/models";
import { loadSettings, saveApiKey, saveModel, saveProvider } from "../lib/settings";
import { CheckIcon, EyeIcon, EyeOffIcon } from "./Icon";

export function Settings() {
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [provider, setProvider] = useState(PROVIDERS[0].id);
  const [showKey, setShowKey] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setApiKey(s.apiKey);
      setSavedKey(s.apiKey);
      setModel(s.model);
      setProvider(s.provider);
    });
  }, []);

  const dirty = apiKey !== savedKey;
  const hasKey = savedKey.length > 0;

  const onSaveKey = async () => {
    await saveApiKey(apiKey);
    setSavedKey(apiKey);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
  };

  const onChangeModel = async (id: string) => {
    setModel(id);
    await saveModel(id);
  };

  const onChangeProvider = async (id: string) => {
    setProvider(id);
    await saveProvider(id);
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
            onChange={(e) => onChangeProvider(e.target.value)}
            disabled
            title="Other providers coming soon"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id} disabled={p.disabled}>
                {p.label}
                {p.disabled ? " (coming soon)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xxs text-text-muted">
            Only Anthropic is supported right now.
          </p>
        </div>

        {/* Model */}
        <div>
          <label className="field-label">Model</label>
          <select
            className="field-select"
            value={model}
            onChange={(e) => onChangeModel(e.target.value)}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* API key */}
        <div>
          <label className="field-label">Anthropic API Key</label>
          <div className="relative">
            <input
              className="field-input pr-20 font-mono"
              type={showKey ? "text" : "password"}
              placeholder="sk-ant-…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
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
              disabled={!dirty || !apiKey.trim()}
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
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              console.anthropic.com
            </a>
            . It is stored locally in this browser only.
          </p>
        </div>
      </div>
    </div>
  );
}
