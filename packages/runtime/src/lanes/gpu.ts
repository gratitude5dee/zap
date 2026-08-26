import { randomUUID } from "node:crypto";
import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import type { ExecResult, LaneExecutor, LaneId, LaneRun, SandboxService } from "@wzrdtech/zap-sandbox";
import { LaneError } from "./core.ts";

/** A GPU lane target — modal in production; injected as a spy in tests. */
export interface GpuLaneTarget {
  run(run: LaneRun & { gpuClass: string }): Promise<ExecResult>;
}

/** A media step that may declare GPU work (C4). */
export interface GpuStepDeclaration {
  gpu?: string | boolean;
}

/**
 * GPU classes a runtime declared: `Runtime.md.lanes` entries shaped
 * `gpu:<class>` plus media steps carrying `gpu: "<class>"`.
 */
export function declaredGpuClasses(
  lanes: readonly string[] | undefined,
  steps?: readonly GpuStepDeclaration[],
): string[] {
  const classes = new Set<string>();
  for (const lane of lanes ?? []) {
    if (lane.startsWith("gpu:") && lane.length > 4) classes.add(lane.slice(4));
  }
  for (const step of steps ?? []) {
    if (typeof step.gpu === "string" && step.gpu.length > 0) classes.add(step.gpu);
  }
  return [...classes];
}

export interface GpuLaneExecutorOptions {
  /** the CPU lane executor every non-gpu lane delegates to */
  cpu: LaneExecutor;
  /** `Runtime.md.lanes` for the mounted profile */
  lanes: readonly string[];
  /** media steps that may declare gpu work */
  steps?: readonly GpuStepDeclaration[];
  /**
   * lazy mount for the GPU target (modal). Never invoked unless a gpu:<class>
   * lane was declared and a gpu run arrives — C4: without a lane declaration,
   * modal never mounts.
   */
  mount: () => GpuLaneTarget;
}

/**
 * Wraps the CPU lane executor with GPU routing: `gpu:<class>` runs go to the
 * lazily-mounted GPU target when (and only when) the class was declared;
 * everything else stays on the CPU sandbox.
 */
export function createGpuLaneExecutor(options: GpuLaneExecutorOptions): LaneExecutor {
  const declared = new Set(declaredGpuClasses(options.lanes, options.steps));
  let target: GpuLaneTarget | undefined;
  return {
    allowed(lane: LaneId, argv0: string) {
      if (lane.startsWith("gpu:")) return declared.has(lane.slice(4));
      return options.cpu.allowed(lane, argv0);
    },
    async run(run: LaneRun) {
      if (!run.lane.startsWith("gpu:")) {
        return options.cpu.run(run);
      }
      const gpuClass = run.lane.slice(4);
      if (!declared.has(gpuClass)) {
        throw new LaneError(
          "GPU_LANE_NOT_DECLARED",
          `lane ${run.lane} was not declared in Runtime.md.lanes and no media step declares gpu:${gpuClass} (C4)`,
        );
      }
      if (run.argv.length === 0) {
        throw new LaneError("EMPTY_ARGV", "lane run requires a non-empty argv");
      }
      target ??= options.mount();
      const id = run.id ?? randomUUID();
      const result = await target.run({ ...run, gpuClass });
      return { ...result, id, lane: run.lane, isolation: "gpu" as const };
    },
  };
}

export interface GpuLanesPluginConfig {
  lanes: string[];
  steps?: GpuStepDeclaration[];
}

const schema = z.object({
  lanes: z.array(z.string()),
  steps: z.array(z.object({ gpu: z.union([z.string(), z.boolean()]).optional() })).optional(),
}) as z.ZodType<GpuLanesPluginConfig>;

/**
 * `lanes.gpu` — wraps the `lanes` service with GPU routing. The modal sandbox
 * is acquired through the `sandbox` service with purpose "lane" on first use,
 * so it never mounts unless a gpu:<class> lane was declared (C4).
 */
export const lanesGpu = definePlugin<GpuLanesPluginConfig>({
  name: "lanes.gpu",
  inject: ["lanes", "sandbox"],
  schema,
  async apply(ctx, config) {
    const cpu = await ctx.inject<LaneExecutor>("lanes");
    const sandbox = await ctx.inject<SandboxService>("sandbox");
    const executor = createGpuLaneExecutor({
      cpu,
      lanes: config.lanes,
      steps: config.steps,
      mount: () => ({
        async run(run) {
          const handle = await sandbox.acquire({
            provider: "modal",
            purpose: "lane",
            idempotencyKey: `gpu-lane-${run.id ?? randomUUID()}`,
            size: run.gpuClass,
          });
          try {
            return await handle.exec([...run.argv], {
              cwd: run.cwd,
              env: run.env,
              timeoutMs: run.timeoutMs,
              lane: run.lane,
            });
          } finally {
            await handle.release();
          }
        },
      }),
    });
    await ctx.effect(() => ctx.provide("lanes", executor));
  },
});
