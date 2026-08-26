// zap-heavy-grok overlay on zap-heavy-opencode: xAI-routed (gateway.llm("xai"))
// — the Grok Bot consumer product has no runtime surface (verify item 11).
import { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
import type { HarnessManifest, HarnessService } from "./zap.ts";

export function grokHarnessManifest(): HarnessManifest {
  return {
    id: "grok",
    minWeight: "heavy",
    // inherits the opencode server pin; route pinned to xai (C30)
    pins: { "opencode-ai": "0.6.4" },
    ports: [{ port: 4096, role: "api", hostPrivate: true }],
    units: ["opencode-serve.service"],
    stateDirs: ["~/.config/opencode", "~/.local/share/opencode"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "~/.config/opencode/opencode.json", format: "json" },
    llmAuth: [
      // BYOK allowlist only — never baked into a snapshot (C6)
      { env: "XAI_API_KEY", mode: "byok" },
    ],
    disabledInbound: ["tui", "share"],
    run: "http-runs",
    managedGateway: { file: "~/.config/opencode/opencode.json", key: "provider.zap.options.baseURL", flavor: "openai" },
  };
}

export function createGrokHarnessService(transport: HarnessTransport): HarnessService {
  return createHarnessDriver({
    manifest: grokHarnessManifest,
    transport,
    http: {
      createPath: "/v1/runs",
      eventsPath: (runId) => `/v1/runs/${runId}/events`,
      healthPath: "/health",
    },
  });
}
