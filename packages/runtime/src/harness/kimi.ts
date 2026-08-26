// zap-heavy-kimi opt-in overlay: `kimi web --no-open --port 58627` over
// http-runs behind a --private hosted route.
import { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
import type { HarnessManifest, HarnessService } from "./zap.ts";

export function kimiHarnessManifest(): HarnessManifest {
  return {
    id: "kimi",
    minWeight: "heavy",
    pins: { "@moonshot-ai/kimi-code": "0.5.1" },
    ports: [{ port: 58627, role: "api", hostPrivate: true }],
    units: ["kimi-web.service"],
    stateDirs: ["~/.kimi"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "~/.kimi/mcp.json", format: "json" },
    llmAuth: [{ env: "MOONSHOT_API_KEY", mode: "byok" }],
    disabledInbound: ["terminal-ui"],
    run: "http-runs",
    managedGateway: { file: "~/.kimi/config.json", key: "baseUrl", flavor: "openai" },
  };
}

export function createKimiHarnessService(transport: HarnessTransport): HarnessService {
  return createHarnessDriver({
    manifest: kimiHarnessManifest,
    transport,
    http: { createPath: "/v1/runs", eventsPath: (runId) => `/v1/runs/${runId}/events` },
  });
}
