// zap-heavy-opencode: `opencode serve` on 4096 (0.0.0.0 behind the per-box
// OPENCODE_SERVER_PASSWORD and a --private hosted route) over http-runs.
import { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
import type { HarnessManifest, HarnessService } from "./zap.ts";

export function opencodeHarnessManifest(): HarnessManifest {
  return {
    id: "opencode",
    minWeight: "heavy",
    // npm pin re-verified at bake (C30)
    pins: { "opencode-ai": "0.6.4" },
    ports: [{ port: 4096, role: "api", hostPrivate: true }],
    units: ["opencode-serve.service"],
    stateDirs: ["~/.config/opencode", "~/.local/share/opencode"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "~/.config/opencode/opencode.json", format: "json" },
    llmAuth: [
      { env: "OPENAI_API_KEY", mode: "byok" },
      { env: "ANTHROPIC_API_KEY", mode: "byok" },
    ],
    disabledInbound: ["tui", "share"],
    run: "http-runs",
    managedGateway: { file: "~/.config/opencode/opencode.json", key: "provider.zap.options.baseURL", flavor: "openai" },
  };
}

export function createOpencodeHarnessService(transport: HarnessTransport): HarnessService {
  return createHarnessDriver({
    manifest: opencodeHarnessManifest,
    transport,
    http: {
      createPath: "/v1/runs",
      eventsPath: (runId) => `/v1/runs/${runId}/events`,
      healthPath: "/health",
    },
  });
}
