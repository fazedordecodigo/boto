import { invoke } from "@tauri-apps/api/core";
import { check as checkForUpdate } from "@tauri-apps/plugin-updater";
import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/errors";
import { errorFields, logWarn } from "../lib/log";
import {
  pendingUpdate,
  releaseUpdate,
  runUpdater,
  selfUpdates,
  type UpdateLike,
  type UpdaterPhase,
} from "../lib/updater";

type State = "idle" | "checking" | "none" | "available" | "installing" | "done" | "error";

const nativeBundleType = () => invoke<string | null>("bundle_type");

export function UpdateButton({
  native = "__TAURI_INTERNALS__" in window,
  bundleType = nativeBundleType,
  check = checkForUpdate,
}: {
  native?: boolean;
  bundleType?: () => Promise<string | null>;
  check?: () => Promise<UpdateLike | null>;
}) {
  const [bundle, setBundle] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<State>("idle");
  const [update, setUpdate] = useState<UpdateLike | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedPhase, setFailedPhase] = useState<UpdaterPhase | null>(null);
  const held = useRef<UpdateLike | null>(null);
  useEffect(() => {
    if (!native) return;
    let live = true;
    bundleType().then(
      (value) => live && setBundle(value),
      (cause: unknown) => {
        logWarn("updater.bundle_type", errorFields(cause));
        if (live) setBundle(null);
      },
    );
    return () => {
      live = false;
    };
  }, [native, bundleType]);
  useEffect(
    () => () => {
      void releaseUpdate(held.current);
      held.current = null;
    },
    [],
  );
  if (!native)
    return (
      <p className="st-desc" id="st-update-browser">
        As atualizações são instaladas pelo app desktop do Boto.
      </p>
    );
  if (bundle === undefined) return null;
  if (!selfUpdates(bundle))
    return (
      <p className="st-desc" id="st-update-unsupported">
        {bundle === "deb" || bundle === "rpm"
          ? `Esta instalação veio de um pacote .${bundle}. Atualize o Boto pelo gerenciador de pacotes do sistema.`
          : "Esta cópia do Boto não foi instalada por um instalador e não se atualiza por aqui."}
      </p>
    );
  const hold = (next: UpdateLike | null) => {
    if (held.current !== next) void releaseUpdate(held.current);
    held.current = next;
    setUpdate(next);
  };
  const run = async () => {
    setError(null);
    setFailedPhase(null);
    const pending = pendingUpdate(state, update);
    setState(pending ? "installing" : "checking");
    const outcome = await runUpdater(pending, check);
    if (outcome.kind === "installed") {
      hold(null);
      setState("done");
      return;
    }
    if (outcome.kind === "checked") {
      hold(outcome.update);
      setState(outcome.update ? "available" : "none");
      return;
    }
    hold(outcome.update);
    setFailedPhase(outcome.phase);
    setError(errorMessage(outcome.error));
    setState("error");
  };
  const action = {
    idle: "Verificar atualizações",
    checking: "Verificando…",
    none: "Verificar novamente",
    available: `Instalar ${update?.version ?? "atualização"}`,
    installing: "Instalando…",
    done: null,
    error: "Verificar novamente",
  }[state];
  const status = {
    none: "Tudo atualizado.",
    available: `A versão ${update?.version ?? "nova"} está disponível.`,
    done: "Atualização instalada. Reinicie o Boto para concluir.",
  }[state as "none" | "available" | "done"];
  return (
    <div className="od-field">
      {status && (
        <p className="st-desc" id="st-update-status" role="status">
          {status}
        </p>
      )}
      {state === "error" && (
        <p className="st-error" id="st-update-error" role="alert">
          {failedPhase === "install"
            ? "Não foi possível instalar a atualização."
            : "Não foi possível verificar atualizações."}{" "}
          {error}
        </p>
      )}
      {action && (
        <div className="od-row">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            id="st-update"
            disabled={state === "checking" || state === "installing"}
            onClick={() => void run()}
          >
            {action}
          </button>
        </div>
      )}
    </div>
  );
}
