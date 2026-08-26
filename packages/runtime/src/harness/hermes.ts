// zap-heavy-hermes: Hermes api_server over http-runs, airv2 invariants
// (one user/one box, noEnv, filesystem memory, only api_server enabled,
// hermes-host.service re-hosts 8642/9119 --private after stop/resume).
import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
import type { HarnessManifest, HarnessService } from "./zap.ts";

export interface HermesPluginConfig {
  profile?: string;
  transport?: HarnessTransport;
}

const schema = z
  .object({
    profile: z.string().optional(),
    transport: z.custom<HarnessTransport>((value) => typeof value === "object" && value !== null).optional(),
  })
  .optional();

export function hermesHarnessManifest(): HarnessManifest {
  return {
    id: "hermes",
    minWeight: "heavy",
    // HERMES_REF re-verified at bake (verify item 10: /v1/runs + SSE contract)
    pins: { HERMES_REF: "v0.4.1" },
    ports: [
      { port: 8642, role: "api", hostPrivate: true },
      { port: 9119, role: "dashboard", hostPrivate: true },
    ],
    units: ["hermes-gateway.service", "hermes-dashboard.service", "hermes-host.service"],
    stateDirs: ["~/.hermes"],
    skillsDirs: ["/zap/skills", "~/.hermes/skills"],
    mcpConfig: { path: "~/.hermes/config.yaml", format: "yaml" },
    llmAuth: [
      { env: "OPENAI_API_KEY", mode: "byok" },
      { env: "ANTHROPIC_API_KEY", mode: "byok" },
      { env: "OPENAI_BASE_URL", mode: "managed" },
    ],
    // only api_server is enabled in ~/.hermes/config.yaml; every channel
    // adapter ships disabled (checked by doctor.sh via /api/messaging/platforms)
    disabledInbound: ["discord", "telegram", "slack", "whatsapp", "twitter", "imessage", "email"],
    run: "http-runs",
    managedGateway: { file: "~/.hermes/.env", key: "OPENAI_BASE_URL", flavor: "openai" },
  };
}

export function createHermesHarnessService(transport: HarnessTransport): HarnessService {
  return createHarnessDriver({
    manifest: hermesHarnessManifest,
    transport,
    http: {
      createPath: "/v1/runs",
      eventsPath: (runId) => `/v1/runs/${runId}/events`,
      healthPath: "/api/health",
    },
  });
}

/** Hermes harness plugin: provides the caller-side driver as "harness". */
export const hermes = definePlugin<HermesPluginConfig | undefined>({
  name: "harness.hermes",
  inject: ["sandbox"],
  schema,
  apply(ctx, config) {
    const transport = config?.transport;
    if (!transport) {
      throw new Error("harness.hermes requires a transport (the hosted api_server route with its per-box key).");
    }
    ctx.provide("harness", createHermesHarnessService(transport));
  },
});
