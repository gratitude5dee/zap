// zap-med-interpreter overlay manifest (Open Interpreter, ws-jsonrpc).
import type { HarnessManifest } from "./zap.ts";

export function interpreterHarnessManifest(): HarnessManifest {
  return {
    id: "interpreter",
    minWeight: "med",
    pins: {},
    ports: [{ port: 9000, role: "api", hostPrivate: true }],
    units: ["zap-interpreter.service"],
    stateDirs: ["~/.openinterpreter"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "~/.openinterpreter/config.toml", format: "toml" },
    llmAuth: [
      { env: "OPENAI_API_KEY", mode: "byok" },
      { env: "ANTHROPIC_API_KEY", mode: "byok" },
    ],
    disabledInbound: [],
    run: "ws-jsonrpc",
  };
}
