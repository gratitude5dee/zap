// zap-heavy-pi opt-in overlay: pi coding agent over rpc-jsonl.
import { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
import type { HarnessManifest, HarnessService } from "./zap.ts";

export function piHarnessManifest(): HarnessManifest {
  return {
    id: "pi",
    minWeight: "heavy",
    pins: { "@earendil-works/pi-coding-agent": "0.3.2" },
    ports: [],
    units: [],
    stateDirs: ["~/.pi/agent"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "~/.pi/agent/settings.json", format: "json" },
    llmAuth: [
      { env: "OPENAI_API_KEY", mode: "byok" },
      { env: "ANTHROPIC_API_KEY", mode: "byok" },
    ],
    disabledInbound: [],
    run: "rpc-jsonl",
    managedGateway: { file: "~/.pi/agent/settings.json", key: "providers.zap.baseUrl", flavor: "openai" },
  };
}

export function createPiHarnessService(transport: HarnessTransport): HarnessService {
  return createHarnessDriver({
    manifest: piHarnessManifest,
    transport,
    cli: { argv: (input) => ["pi", "agent", "--rpc", "--json", ...(input.live ? [] : ["--plan"]), input.prompt] },
  });
}
