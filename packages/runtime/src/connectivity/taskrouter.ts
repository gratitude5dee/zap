/**
 * Opt-in local task router: an advisory shadow classifier on 127.0.0.1:1917.
 *
 * It proposes; the control plane still decides. There is no credential and no
 * egress, and a missing model is not an outage — the router answers from the
 * same closed enums with deterministic heuristics, which `status.mode`
 * reports as "heuristic".
 */
import { ConnectivityCommandError, type ConnectivityBox, type TaskrouterStatus } from "./types.ts";

const UNIT = "zap-taskrouter.service";
const PROBE = "curl -fsS --max-time 3 http://127.0.0.1:1917/healthz >/dev/null 2>&1 && echo running || echo stopped";

export async function taskrouterStatus(box: ConnectivityBox): Promise<TaskrouterStatus> {
  const installed = await box.exec("test -x /home/user/.zap/taskrouter/run.sh && echo installed || echo missing", 60).catch(() => null);
  const model = await box.exec("test -s /home/user/.zap/taskrouter/model.gguf", 60).catch(() => null);
  const probe = await box.exec(PROBE, 30).catch(() => null);
  const modelPresent = model !== null && model.exitCode === 0;
  return {
    installed: installed !== null && installed.stdout.trim() !== "missing",
    mode: modelPresent ? "model" : "heuristic",
    modelPresent,
    running: probe !== null && probe.stdout.trim() === "running",
  };
}

export async function enableTaskrouter(box: ConnectivityBox): Promise<TaskrouterStatus> {
  const result = await box.exec(`sudo systemctl enable --now ${UNIT} && sleep 2 && ${PROBE}`, 180);
  if (result.exitCode !== 0) {
    throw new ConnectivityCommandError("taskrouter", `taskrouter start failed: ${result.stderr.slice(0, 500)}`);
  }
  return taskrouterStatus(box);
}

export async function disableTaskrouter(box: ConnectivityBox): Promise<void> {
  await box.exec(`sudo systemctl disable --now ${UNIT} 2>/dev/null || true`, 120).catch(() => undefined);
}
