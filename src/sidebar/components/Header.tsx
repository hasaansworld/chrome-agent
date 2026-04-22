import { getModelLabel, type ProviderId } from "../../shared/models";
import { SettingsIcon, ArrowLeftIcon } from "./Icon";

interface Props {
  view: "chat" | "settings";
  provider: ProviderId;
  model: string;
  onOpenSettings: () => void;
  onBack: () => void;
}

export function Header({ view, provider, model, onOpenSettings, onBack }: Props) {
  const modelLabel = getModelLabel(provider, model);

  return (
    <header className="flex items-center justify-between border-b border-border bg-bg px-3 py-2.5 h-[52px] shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {view === "settings" ? (
          <button onClick={onBack} className="btn-ghost -ml-1.5" aria-label="Back">
            <ArrowLeftIcon className="h-4 w-4" />
          </button>
        ) : (
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-black text-xs font-bold">
            C
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">
            {view === "settings" ? "Settings" : "Chrome Agent"}
          </div>
          {view === "chat" && (
            <div className="text-xxs text-text-muted truncate">{modelLabel}</div>
          )}
        </div>
      </div>

      {view === "chat" && (
        <button
          onClick={onOpenSettings}
          className="btn-ghost"
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
      )}
    </header>
  );
}
