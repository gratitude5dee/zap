import { readFile } from "node:fs/promises";
import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import type {
  DoctorReport,
  SandboxCapabilities,
  SandboxFs,
  SandboxHandle,
  SandboxProvider,
  SandboxService,
  SandboxSpec,
} from "../../contract.ts";

export class ModalSandboxError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ModalSandboxError";
    this.code = code;
  }
}

/** Default working directory inside a Modal sandbox container. */
export const MODAL_WORKDIR = "/root";
/** Pinned SDK release the adapter is written against (npm modal). */
export const MODAL_SDK_VERSION = "0.3.14";

/**
 * GPU classes priced in pricing.json; MODAL_CAPABILITIES.sizes must stay in
 * sync (the modal.test.ts pricing test fails on drift).
 */
export const MODAL_GPU_CLASSES = [
  "T4",
  "L4",
  "A10G",
  "L40S",
  "A100-40GB",
  "A100-80GB",
  "H100",
  "H200",
  "B200",
] as const;

export const MODAL_CAPABILITIES: SandboxCapabilities = {
  exec: true,
  files: true,
  readdir: false,
  detached: false,
  snapshot: false,
  fork: false,
  stop: false,
  resume: false,
  ports: false,
  privatePorts: false,
  desktop: false,
  ssh: false,
  networkPolicy: "none",
  gpu: true,
  kvm: false,
  docker: false,
  isolation: "container",
  sizes: MODAL_GPU_CLASSES,
  maxCommandSeconds: 3600,
};

const pricingSchema = z.object({
  sku: z.literal("gpu_second"),
  currency: z.string(),
  source: z.string(),
  checkedAt: z.string(),
  verified: z.boolean(),
  classes: z.record(z.string(), z.number().positive()),
});

export type ModalPricing = z.infer<typeof pricingSchema>;

let pricingCache: ModalPricing | undefined;

/** Loads pricing.json (gpu_second sku, USD per GPU-second per class). */
export async function loadModalPricing(): Promise<ModalPricing> {
  if (!pricingCache) {
    const raw = await readFile(new URL("./pricing.json", import.meta.url), "utf8");
    pricingCache = pricingSchema.parse(JSON.parse(raw));
  }
  return pricingCache;
}

export function estimateGpuCost(gpuClass: string, seconds: number, pricing: ModalPricing): number {
  const rate = pricing.classes[gpuClass];
  if (rate === undefined) {
    throw new ModalSandboxError("UNKNOWN_GPU_CLASS", `unknown gpu class ${gpuClass} in pricing.json`);
  }
  return rate * seconds;
}

/** Structural slice of the modal SDK sandbox surface this adapter uses. */
export interface ModalSandboxLike {
  id: string;
  exec(
    command: string,
    opts?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  readFile(path: string): Promise<Uint8Array | null>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  removePath(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>;
  terminate(): Promise<void>;
}

export interface ModalAdapterConfig {
  /** MODAL_TOKEN_ID / MODAL_TOKEN_SECRET pair presence; never read from process.env */
  tokenId?: string;
  tokenSecret?: string;
  /** GPU class requested for the lane; must be priced in pricing.json */
  gpuClass?: string;
  /** injected factory for tests; production wires the modal SDK Sandbox */
  createSandbox?: (spec: SandboxSpec) => Promise<ModalSandboxLike>;
}

function makeFs(sandbox: ModalSandboxLike, assertLive: () => void): SandboxFs {
  const resolvePath = (p: string) => (p.startsWith("/") ? p : `${MODAL_WORKDIR}/${p}`);
  return {
    resolve: resolvePath,
    async read(p) {
      assertLive();
      return sandbox.readFile(resolvePath(p));
    },
    async write(p, bytes) {
      assertLive();
      await sandbox.writeFile(resolvePath(p), bytes);
    },
    async remove(p, opts) {
      assertLive();
      await sandbox.removePath(resolvePath(p), opts);
    },
  };
}

/**
 * `modal` is a GPU lane target only (C4): acquire refuses every purpose except
 * "lane" so a CPU runtime can never mount it by accident.
 */
export function createModalProvider(config: ModalAdapterConfig): SandboxProvider {
  return {
    id: "modal",
    async capabilities() {
      return MODAL_CAPABILITIES;
    },
    async acquire(spec) {
      if (spec.purpose !== "lane") {
        throw new ModalSandboxError(
          "MODAL_LANE_ONLY",
          `modal is a gpu lane plugin; purpose "${spec.purpose}" is not allowed (only "lane")`,
        );
      }
      if (!config.createSandbox) {
        throw new ModalSandboxError(
          "SDK_REQUIRED",
          `modal adapter requires the modal SDK (modal@${MODAL_SDK_VERSION}) or an injected factory`,
        );
      }
      const sandbox = await config.createSandbox(spec);
      let released = false;
      const assertLive = () => {
        if (released) throw new ModalSandboxError("SANDBOX_RELEASED", "sandbox handle was released");
      };
      const handle: SandboxHandle = {
        id: sandbox.id,
        provider: "modal",
        capabilities: MODAL_CAPABILITIES,
        fs: makeFs(sandbox, assertLive),
        async state() {
          return released ? "stopped" : "ready";
        },
        async exec(command, opts = {}) {
          assertLive();
          const startedAt = new Date().toISOString();
          const text = typeof command === "string" ? command : command.map((part) => JSON.stringify(part)).join(" ");
          const cwd = opts.cwd
            ? opts.cwd.startsWith("/")
              ? opts.cwd
              : `${MODAL_WORKDIR}/${opts.cwd}`
            : MODAL_WORKDIR;
          const result = await sandbox.exec(text, { cwd, env: opts.env, timeoutMs: opts.timeoutMs });
          return {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            timedOut: false,
            truncated: false,
            startedAt,
            finishedAt: new Date().toISOString(),
            usage: { bytesIn: 0, bytesOut: result.stdout.length + result.stderr.length },
          };
        },
        async release() {
          if (released) return;
          released = true;
          await sandbox.terminate().catch(() => undefined);
        },
        async captureState() {
          return { provider: "modal", metadata: { id: sandbox.id, gpuClass: config.gpuClass ?? null } };
        },
      };
      return handle;
    },
    async doctor(): Promise<DoctorReport> {
      const wired = Boolean(config.createSandbox || (config.tokenId?.trim() && config.tokenSecret?.trim()));
      let pricingOk = true;
      let pricingDetail = "pricing.json parsed";
      try {
        const pricing = await loadModalPricing();
        const priced = Object.keys(pricing.classes).sort();
        const sized = [...MODAL_CAPABILITIES.sizes].sort();
        pricingOk = priced.length === sized.length && priced.every((c, i) => c === sized[i]);
        if (!pricingOk) pricingDetail = "pricing.json classes drifted from MODAL_GPU_CLASSES";
      } catch (error) {
        pricingOk = false;
        pricingDetail = `pricing.json failed to load: ${error instanceof Error ? error.message : String(error)}`;
      }
      return {
        provider: "modal",
        ok: wired && pricingOk,
        checks: [
          {
            id: "modal.sdk",
            ok: wired,
            required: true,
            detail: wired
              ? `first-party (gpu lane only) — modal ${MODAL_SDK_VERSION}`
              : "first-party (gpu lane only) — missing MODAL_TOKEN_ID/MODAL_TOKEN_SECRET",
            remediation: wired ? undefined : "run `modal token new` and configure tokenId/tokenSecret",
          },
          {
            id: "modal.pricing",
            ok: pricingOk,
            required: true,
            detail: pricingDetail,
          },
        ],
      };
    },
  };
}

const schema = z
  .object({
    tokenId: z.string().optional(),
    tokenSecret: z.string().optional(),
    gpuClass: z.string().optional(),
  })
  .optional() as z.ZodType<ModalAdapterConfig | undefined>;

/** `sandbox.modal` — opt-in GPU lane plugin (C4); mounts only when a gpu:<class> lane is declared. */
export const modalAdapter = definePlugin<ModalAdapterConfig | undefined>({
  name: "sandbox.modal",
  inject: ["sandbox"],
  schema,
  async apply(ctx, config) {
    const sandbox = await ctx.inject<SandboxService>("sandbox");
    const provider = createModalProvider(config ?? {});
    await ctx.effect(() => sandbox.register(provider));
  },
});
