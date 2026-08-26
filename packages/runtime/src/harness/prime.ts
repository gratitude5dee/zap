// zap-heavy-prime opt-in overlay: prime-agent in RPC mode over rpc-jsonl.
import { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
import type { HarnessManifest, HarnessService } from "./zap.ts";

export function primeHarnessManifest(): HarnessManifest {
  return {
    id: "prime",
    minWeight: "heavy",
    pins: { "prime-agent": "0.2.0" },
    ports: [],
    units: [],
    stateDirs: ["~/.prime/agent"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "~/.prime/agent/settings.json", format: "json" },
    llmAuth: [
      { env: "OPENAI_API_KEY", mode: "byok" },
      { env: "ANTHROPIC_API_KEY", mode: "byok" },
    ],
    disabledInbound: [],
    run: "rpc-jsonl",
    managedGateway: { file: "~/.prime/agent/settings.json", key: "providers.zap.baseUrl", flavor: "openai" },
  };
}

export function createPrimeHarnessService(transport: HarnessTransport): HarnessService {
  return createHarnessDriver({
    manifest: primeHarnessManifest,
    transport,
    cli: { argv: (input) => ["prime-agent", "--rpc", ...(input.live ? [] : ["--plan"]), input.prompt] },
  });
}
