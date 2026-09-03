// zap-heavy-exo: exo agentd over http-runs. Same wire contract as Hermes'
// api_server (POST /v1/runs, SSE /v1/runs/{id}/events, /stop, /approval,
// /api/sessions) under the airv2 invariants: one user/one box, noEnv, only
// agentd inbound on 0.0.0.0:8642 behind a per-box API_SERVER_KEY, and
// exo-host.service re-hosting 8642 --private after stop/resume.
import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
import type { HarnessManifest, HarnessService } from "./zap.ts";

export interface ExoPluginConfig {
  profile?: string;
  transport?: HarnessTransport;
}

const schema = z
  .object({
    profile: z.string().optional(),
    transport: z.custom<HarnessTransport>((value) => typeof value === "object" && value !== null).optional(),
  })
  .optional();

export function exoHarnessManifest(): HarnessManifest {
  return {
    id: "exo",
    minWeight: "heavy",
    // EXO_REF re-verified at bake (exo agentd /v1/runs + SSE contract)
    pins: { EXO_REF: "main" },
    ports: [{ port: 8642, role: "api", hostPrivate: true }],
    units: ["exo-agentd.service", "exo-host.service"],
    stateDirs: ["~/.exo"],
    // /zap/skills is the shared store; exo's own SKILL.md catalog is an
    // agent artifact under its --root (~/.exo/artifacts/**/skills).
    skillsDirs: ["/zap/skills", "~/.exo/skills"],
    mcpConfig: { path: "~/.exo/mcp.json", format: "json" },
    llmAuth: [
      { env: "OPENAI_API_KEY", mode: "byok" },
      { env: "ANTHROPIC_API_KEY", mode: "byok" },
      { env: "EXO_MODEL_BASE_URL", mode: "managed" },
    ],
    // exo ships chat adapters (exo/adapters/*) and the unary substrate
    // (`exo serve`); none run in the box — only agentd is inbound.
    disabledInbound: ["discord", "slack", "whatsapp", "signal", "irc", "exochat", "agent-cli", "substrate"],
    run: "http-runs",
    managedGateway: { file: "~/.exo/.env", key: "EXO_MODEL_BASE_URL", flavor: "openai" },
  };
}

export function createExoHarnessService(transport: HarnessTransport): HarnessService {
  return createHarnessDriver({
    manifest: exoHarnessManifest,
    transport,
    http: {
      createPath: "/v1/runs",
      eventsPath: (runId) => `/v1/runs/${runId}/events`,
      healthPath: "/health",
    },
  });
}

/** exo harness plugin: provides the caller-side driver as "harness". */
export const exo = definePlugin<ExoPluginConfig | undefined>({
  name: "harness.exo",
  inject: ["sandbox"],
  schema,
  apply(ctx, config) {
    const transport = config?.transport;
    if (!transport) {
      throw new Error("harness.exo requires a transport (the hosted agentd route with its per-box key).");
    }
    ctx.provide("harness", createExoHarnessService(transport));
  },
});
