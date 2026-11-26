import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { UpdateLike } from "../../src/lib/updater";
import { UpdateButton } from "../../src/settings/UpdateButton";
import "../../src/styles/tokens.css";
import "../../src/styles/ui.css";

const params = new URLSearchParams(location.search);
const bundle = params.get("bundle");
const outcome = params.get("check") ?? "none";
const install = params.get("install") ?? "ok";
const calls = { checks: 0, installs: 0, closed: [] as string[] };
Object.assign(window, { updaterCalls: calls });
let created = 0;

const bundleType = async () => (bundle === "none" ? null : bundle);
async function check(): Promise<UpdateLike | null> {
  calls.checks++;
  if (outcome === "fail") throw new Error("endpoint offline");
  if (outcome === "none") return null;
  const id = `update-${++created}`;
  return {
    version: "0.5.1",
    async downloadAndInstall() {
      calls.installs++;
      if (install === "fail") throw new Error("signature mismatch");
    },
    async close() {
      calls.closed.push(id);
    },
  };
}

function Harness() {
  const [shown, setShown] = useState(true);
  return (
    <main>
      {shown && <UpdateButton native bundleType={bundleType} check={check} />}
      <button type="button" id="unmount" onClick={() => setShown(false)}>
        Sair
      </button>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<Harness />);
