import { check, type Update } from "@tauri-apps/plugin-updater";
import { useState } from "react";
import { errorMessage } from "../lib/errors";
import { pendingUpdate, runUpdater, type UpdaterPhase } from "../lib/updater";

export function UpdateButton() {
  const [state, setState] = useState<
    "idle" | "checking" | "none" | "available" | "installing" | "done" | "error"
  >("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedPhase, setFailedPhase] = useState<UpdaterPhase | null>(null);
  if (!("__TAURI_INTERNALS__" in window))
    return (
      <p className="st-desc" id="st-update-browser">
        As atualizações são instaladas pelo app desktop do Boto.
      </p>
    );
  const run = async () => {
    setError(null);
    setFailedPhase(null);
    const pending = pendingUpdate(state, update);
    setState(pending ? "installing" : "checking");
    const outcome = await runUpdater(pending, () => check());
    if (outcome.kind === "installed") {
      setState("done");
      return;
    }
    if (outcome.kind === "checked") {
      setUpdate(outcome.update);
      setState(outcome.update ? "available" : "none");
      return;
    }
    setUpdate(outcome.update);
    setFailedPhase(outcome.phase);
    setError(errorMessage(outcome.error));
    setState("error");
  };
  const label = {
    idle: "Verificar atualizações",
    checking: "Verificando…",
    none: "Tudo atualizado",
    available: `Instalar ${update?.version ?? "atualização"}`,
    installing: "Instalando…",
    done: "Reinicie o Boto para concluir",
    error:
      failedPhase === "install"
        ? "Falha ao instalar atualização"
        : "Falha ao verificar atualizações",
  }[state];
  return (
    <div className="od-row">
      <button
        type="button"
        className="btn btn-outline btn-sm"
        id="st-update"
        disabled={state === "checking" || state === "installing" || state === "done"}
        onClick={() => void run()}
      >
        {label}
      </button>
      {error && (
        <span className="st-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
