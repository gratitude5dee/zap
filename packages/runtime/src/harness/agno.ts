// zap-heavy-agno opt-in overlay: AgentOS app on 7777 (uv venv, agno[os])
// behind OS_SECURITY_KEY and a --private hosted route, over http-runs.
import { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
import type { HarnessManifest, HarnessService } from "./zap.ts";

export function agnoHarnessManifest(): HarnessManifest {
  return {
    id: "agno",
    minWeight: "heavy",
    pins: { agno: "2.1.0" },
    ports: [{ port: 7777, role: "api", hostPrivate: true }],
    units: ["agno-os.service"],
    stateDirs: ["/opt/zap/agno"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "/opt/zap/agno/mcp.json", format: "json" },
    llmAuth: [
      { env: "OPENAI_API_KEY", mode: "byok" },
      { env: "OPENAI_BASE_URL", mode: "managed" },
    ],
    disabledInbound: ["control-plane-ui"],
    run: "http-runs",
    managedGateway: { file: "/opt/zap/agno/.env", key: "OPENAI_BASE_URL", flavor: "openai" },
  };
}

export function createAgnoHarnessService(transport: HarnessTransport): HarnessService {
  return createHarnessDriver({
    manifest: agnoHarnessManifest,
    transport,
    http: { createPath: "/v1/runs", eventsPath: (runId) => `/v1/runs/${runId}/events` },
  });
}
