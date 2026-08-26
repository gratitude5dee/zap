// zap-heavy-frontier opt-in overlay: uv-managed Python 3.12 install,
// headless `frontier-agent -p --no-tui` over cli-exec.
import { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
import type { HarnessManifest, HarnessService } from "./zap.ts";

export function frontierHarnessManifest(): HarnessManifest {
  return {
    id: "frontier",
    minWeight: "heavy",
    pins: { "frontier-agent": "0.1.5", python: "3.12" },
    ports: [],
    units: [],
    stateDirs: ["~/.frontier"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "~/.frontier/mcp.json", format: "json" },
    llmAuth: [
      { env: "OPENAI_API_KEY", mode: "byok" },
      { env: "OPENAI_BASE_URL", mode: "managed" },
    ],
    disabledInbound: [],
    run: "cli-exec",
    managedGateway: { file: "~/.frontier/.env", key: "OPENAI_BASE_URL", flavor: "openai" },
  };
}

export function createFrontierHarnessService(transport: HarnessTransport): HarnessService {
  return createHarnessDriver({
    manifest: frontierHarnessManifest,
    transport,
    cli: { argv: (input) => ["frontier-agent", "-p", "--no-tui", ...(input.live ? [] : ["--plan"]), input.prompt] },
  });
}
