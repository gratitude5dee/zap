/**
 * Opt-in loopback agent bus (ported from airv2 `lib/box/cotal.ts`).
 *
 * Cotal never leaves the box: no credential, no join, nothing to redact. It is
 * preinstalled but stopped, so enabling it is a local `cotal up` and disabling
 * it is a local `cotal down`; both are idempotent.
 */
import { ConnectivityCommandError, type ConnectivityBox, type CotalStatus } from "./types.ts";

const PATH_PREFIX = "PATH=/home/user/.local/bin:/usr/local/bin:$PATH";

export async function cotalStatus(box: ConnectivityBox): Promise<CotalStatus> {
  const result = await box
    .exec(`${PATH_PREFIX}; command -v cotal >/dev/null || { echo missing; exit 0; }; cotal status >/dev/null 2>&1 && echo up || echo down`, 60)
    .catch(() => null);
  const out = result?.stdout.trim() ?? "";
  if (!result || out === "" || out === "missing") return { installed: false, running: false };
  return { installed: true, running: out === "up" };
}

export async function enableCotal(box: ConnectivityBox): Promise<CotalStatus> {
  const result = await box.exec(`${PATH_PREFIX}; cotal setup --yes >/dev/null 2>&1 || true; cotal up --detach`, 240);
  if (result.exitCode !== 0) {
    throw new ConnectivityCommandError("cotal", `cotal up failed: ${result.stderr.slice(0, 500)}`);
  }
  return cotalStatus(box);
}

export async function disableCotal(box: ConnectivityBox): Promise<void> {
  await box.exec(`${PATH_PREFIX}; cotal down >/dev/null 2>&1 || true`, 120).catch(() => undefined);
}
