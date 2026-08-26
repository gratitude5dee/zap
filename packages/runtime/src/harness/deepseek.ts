// zap-heavy-deepseek overlay (dsh is an RC, so no named snapshot yet):
// headless cli-exec adapter; presets standard|code|minimal only; the web UI
// on 3080 is never started in the template.
import { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
import type { HarnessManifest, HarnessService } from "./zap.ts";

export const DEEPSEEK_PRESETS = ["standard", "code", "minimal"] as const;

export function deepseekHarnessManifest(): HarnessManifest {
  return {
    id: "deepseek",
    minWeight: "heavy",
    pins: { "@deepseek-ai/dsh": "0.1.1-rc.2" },
    ports: [],
    units: [],
    stateDirs: ["~/.dsh"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "~/.dsh/config.json", format: "json" },
    llmAuth: [
      { env: "DEEPSEEK_API_KEY", mode: "byok" },
      { env: "OPENAI_BASE_URL", mode: "managed" },
    ],
    disabledInbound: [],
    run: "cli-exec",
    managedGateway: { file: "~/.dsh/.env", key: "OPENAI_BASE_URL", flavor: "openai" },
  };
}

export function createDeepseekHarnessService(transport: HarnessTransport): HarnessService {
  return createHarnessDriver({
    manifest: deepseekHarnessManifest,
    transport,
    cli: {
      argv: (input) => [
        "dsh",
        "run",
        "--preset",
        "standard",
        "--json",
        ...(input.live ? [] : ["--plan"]),
        input.prompt,
      ],
    },
  });
}
