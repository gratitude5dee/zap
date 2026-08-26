// zap-med-fx overlay manifest (fx, cli-exec: `fx ask --json`).
import type { HarnessManifest } from "./zap.ts";

export function fxHarnessManifest(): HarnessManifest {
  return {
    id: "fx",
    minWeight: "med",
    pins: {},
    ports: [],
    units: [],
    stateDirs: ["~/.fx"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "~/.fx/mcp.json", format: "json" },
    llmAuth: [
      { env: "OPENAI_API_KEY", mode: "byok" },
      { env: "ANTHROPIC_API_KEY", mode: "byok" },
    ],
    disabledInbound: [],
    run: "cli-exec",
  };
}
