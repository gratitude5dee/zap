// zap-heavy-devin opt-in overlay: an Outposts worker, outbound-only (no
// hosted port). Pull-only: sessions are assigned from the Outposts control
// plane, so a local run() is refused.
import { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
import type { HarnessManifest, HarnessService } from "./zap.ts";

export class HarnessPullOnlyError extends Error {
  readonly code = "HARNESS_PULL_ONLY";

  constructor(id: string) {
    super(`harness.${id} is pull-only: work arrives from its control plane, not from zap runtime exec.`);
    this.name = "HarnessPullOnlyError";
  }
}

export function devinHarnessManifest(): HarnessManifest {
  return {
    id: "devin",
    minWeight: "heavy",
    pullOnly: true,
    // installer channel pin re-verified at bake (C30)
    pins: { "devin-cli": "2026.08" },
    ports: [],
    units: ["devin-worker.service"],
    stateDirs: ["~/.devin"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "~/.devin/mcp.json", format: "json" },
    llmAuth: [],
    disabledInbound: [],
    run: "cli-exec",
  };
}

export function createDevinHarnessService(transport: HarnessTransport): HarnessService {
  const driver = createHarnessDriver({ manifest: devinHarnessManifest, transport });
  return {
    ...driver,
    async run() {
      throw new HarnessPullOnlyError("devin");
    },
  };
}
