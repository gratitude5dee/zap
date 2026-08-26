// zap-heavy-omg overlay: omg computer on 127.0.0.1:8766 over ws-jsonrpc;
// repos rooted at /zap/fs/repos; `omg mcp` registered into the tmux'd CLIs.
import { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
import type { HarnessManifest, HarnessService } from "./zap.ts";

export function omgHarnessManifest(): HarnessManifest {
  return {
    id: "omg",
    minWeight: "heavy",
    // bun global pin re-verified at bake (C30)
    pins: { "@omg-dev/cli": "0.9.3" },
    ports: [{ port: 8766, role: "api", hostPrivate: true }],
    units: ["omg.service"],
    stateDirs: ["~/.omg", "/zap/fs/repos"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "~/.omg/mcp.json", format: "cli" },
    llmAuth: [
      { env: "OPENAI_API_KEY", mode: "byok" },
      { env: "ANTHROPIC_API_KEY", mode: "byok" },
    ],
    disabledInbound: ["web-dashboard", "tmux-attach"],
    run: "ws-jsonrpc",
    managedGateway: { file: "~/.omg/.env", key: "OPENAI_BASE_URL", flavor: "openai" },
  };
}

export function createOmgHarnessService(transport: HarnessTransport): HarnessService {
  return createHarnessDriver({
    manifest: omgHarnessManifest,
    transport,
    ws: {
      path: () => "/ws",
      payload: (input) => ({
        jsonrpc: "2.0",
        id: 1,
        method: "run.start",
        params: { prompt: input.prompt, live: input.live, payer: input.payer },
      }),
    },
  });
}
