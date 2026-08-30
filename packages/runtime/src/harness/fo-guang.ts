// zap-heavy-fo-guang overlay on zap-heavy: the fo-guang robotics profile
// (Unitree G1 sim2sim + God's Eye View telemetry + ABot-Recon reconstruction).
// Driven over cli-exec — the rollout is scripts, not a served agent — and
// telemetry is inbound-only, so robot /command and /map stay disabled. There is
// no caller-side driver: the rollout runs in-box through the fo-guang skill's
// runbook (`zap runtime exec`), not through a served run API.
import type { HarnessManifest } from "./zap.ts";

export function foGuangHarnessManifest(): HarnessManifest {
  return {
    id: "fo-guang",
    minWeight: "heavy",
    // git refs of the three cloned repos plus the runtime wheels (C30)
    pins: {
      mujoco_playground: "0f946c4d9c5f4cc45a7ef094895b67183475c512",
      "gods-eye-view": "cf9874ab20cbf036c7180beb77cd6ee49d9e414a",
      "ABot-Recon": "0962a31c35b483361adef178ff9f641fa8651890",
      onnxruntime: "1.29.0",
      hidapi: "0.14.0.post4",
      torch: "2.5.1",
    },
    // the telemetry bridge speaks over a UNIX socket; nothing is hosted
    ports: [],
    units: ["zap-agentd.service"],
    stateDirs: ["~/mujoco_playground", "~/gods-eye-view", "~/ABot-Recon", "/zap/fs/robot"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "~/.zap/fo-guang/mcp.json", format: "json" },
    llmAuth: [
      // BYOK allowlist only — never baked into a snapshot (C6)
      { env: "GEV_ROBOT_INGEST_TOKEN", mode: "byok" },
    ],
    disabledInbound: ["robot-command", "robot-map"],
    run: "cli-exec",
  };
}
