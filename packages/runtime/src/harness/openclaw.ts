// zap-heavy-openclaw: OpenClaw gateway on 18789 over openai-compat chat
// completions; every channel disabled; per-box auth token; managed mode routes
// models.providers.zap.baseUrl at the gateway proxy.
import { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
import type { HarnessManifest, HarnessService } from "./zap.ts";

export function openclawHarnessManifest(): HarnessManifest {
  return {
    id: "openclaw",
    minWeight: "heavy",
    // npm pin re-verified at bake (C30)
    pins: { openclaw: "1.2.0" },
    ports: [{ port: 18789, role: "api", hostPrivate: true }],
    units: ["openclaw-gateway.service"],
    stateDirs: ["~/.openclaw"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "~/.openclaw/openclaw.json", format: "json5" },
    llmAuth: [
      { env: "OPENAI_API_KEY", mode: "byok" },
      { env: "ANTHROPIC_API_KEY", mode: "byok" },
    ],
    disabledInbound: ["discord", "telegram", "slack", "whatsapp", "signal", "email"],
    run: "openai-compat",
    managedGateway: { file: "~/.openclaw/openclaw.json", key: "models.providers.zap.baseUrl", flavor: "openai" },
  };
}

export function createOpenclawHarnessService(transport: HarnessTransport): HarnessService {
  return createHarnessDriver({
    manifest: openclawHarnessManifest,
    transport,
    openai: { path: "/v1/chat/completions" },
  });
}
