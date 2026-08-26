// zap-heavy-cursor opt-in overlay: `agent -p --output-format json` over
// cli-exec; .cursor/rules and .cursor/mcp.json rendered at bake.
import { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
import type { HarnessManifest, HarnessService } from "./zap.ts";

export function cursorHarnessManifest(): HarnessManifest {
  return {
    id: "cursor",
    minWeight: "heavy",
    // installer channel pin re-verified at bake (C30)
    pins: { "cursor-agent": "2026.08" },
    ports: [],
    units: [],
    stateDirs: ["~/.cursor", "/zap/fs/.cursor"],
    skillsDirs: ["/zap/skills", "/zap/fs/.cursor/rules"],
    mcpConfig: { path: "/zap/fs/.cursor/mcp.json", format: "json" },
    llmAuth: [{ env: "CURSOR_API_KEY", mode: "byok" }],
    disabledInbound: [],
    run: "cli-exec",
    managedGateway: { file: "~/.cursor/cli-config.json", key: "baseUrl", flavor: "openai" },
  };
}

export function createCursorHarnessService(transport: HarnessTransport): HarnessService {
  return createHarnessDriver({
    manifest: cursorHarnessManifest,
    transport,
    cli: { argv: (input) => ["agent", "-p", "--output-format", "json", ...(input.live ? [] : ["--plan"]), input.prompt] },
  });
}
