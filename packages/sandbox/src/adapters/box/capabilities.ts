import type { SandboxCapabilities } from "../../contract.ts";

/**
 * Box capability row (goal.md §6 Z2). `maxCommandSeconds` is verify item 3 —
 * assumed 600 until measured against a live box (docs/verify-log.md).
 */
export const BOX_CAPABILITIES: SandboxCapabilities = {
  exec: true,
  files: true,
  readdir: true,
  detached: true,
  snapshot: true,
  fork: true,
  stop: true,
  resume: true,
  ports: true,
  privatePorts: true,
  desktop: true,
  ssh: true,
  networkPolicy: "none",
  gpu: false,
  kvm: false,
  docker: true,
  isolation: "vm",
  sizes: ["small", "default", "large"],
  maxCommandSeconds: 600,
};
