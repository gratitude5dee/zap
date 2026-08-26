// zap-heavy-headlong opt-in overlay: Docker-in-VM required; the compose
// stack stays on the VM's loopback, driven over cli-exec.
import { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
import type { HarnessManifest, HarnessService } from "./zap.ts";

export function headlongHarnessManifest(): HarnessManifest {
  return {
    id: "headlong",
    minWeight: "heavy",
    pins: { headlong: "0.4.0" },
    ports: [],
    units: ["headlong.service"],
    stateDirs: ["~/.headlong"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "~/.headlong/mcp.json", format: "json" },
    llmAuth: [
      { env: "OPENAI_API_KEY", mode: "byok" },
      { env: "OPENAI_BASE_URL", mode: "managed" },
    ],
    disabledInbound: [],
    run: "cli-exec",
    managedGateway: { file: "~/.headlong/.env", key: "OPENAI_BASE_URL", flavor: "openai" },
  };
}

export function createHeadlongHarnessService(transport: HarnessTransport): HarnessService {
  return createHarnessDriver({
    manifest: headlongHarnessManifest,
    transport,
    cli: { argv: (input) => ["headlong", "run", "--json", ...(input.live ? [] : ["--plan"]), input.prompt] },
  });
}
