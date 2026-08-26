import type { CloudDeps } from "./types.ts";

const BACKOFF_MS = 10 * 60_000;

export interface SweepResult {
  stopped: string[];
  backedOff: string[];
}

/**
 * `stop_after` sweeper: one deadline column, not one timer per sandbox.
 * Stops only ready|idle runtimes past their deadline — never running ones,
 * never with force — and backs off on provider SandboxStartLimit errors.
 */
export async function sweepRuntimes(deps: CloudDeps, now: Date): Promise<SweepResult> {
  const stopped: string[] = [];
  const backedOff: string[] = [];
  const rows = await deps.runtimes.all();
  for (const row of rows) {
    if (row.state !== "ready" && row.state !== "idle") continue;
    if (!row.stopAfter || new Date(row.stopAfter).getTime() > now.getTime()) continue;
    try {
      await deps.sandbox.stop({ id: row.id });
      await deps.runtimes.update(row.id, { state: "stopped", stopAfter: null });
      await deps.counters.bump("sweeperStops");
      stopped.push(row.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("SandboxStartLimit")) {
        await deps.counters.bump("startLimitReached");
        await deps.runtimes.update(row.id, {
          stopAfter: new Date(now.getTime() + BACKOFF_MS).toISOString(),
        });
        backedOff.push(row.id);
      } else {
        backedOff.push(row.id);
      }
    }
  }
  return { stopped, backedOff };
}
