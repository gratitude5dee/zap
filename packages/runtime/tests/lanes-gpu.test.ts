import { describe, expect, it, vi } from "vitest";
import type { ExecResult, LaneExecutor, LaneRun } from "@wzrdtech/zap-sandbox";
import {
  createGpuLaneExecutor,
  declaredGpuClasses,
  type GpuLaneTarget,
} from "../src/lanes/gpu.ts";

function execResult(partial?: Partial<ExecResult>): ExecResult {
  const now = new Date().toISOString();
  return {
    exitCode: 0,
    stdout: "",
    stderr: "",
    timedOut: false,
    truncated: false,
    startedAt: now,
    finishedAt: now,
    usage: { bytesIn: 0, bytesOut: 0 },
    ...partial,
  };
}

function cpuExecutor() {
  const run = vi.fn(async (r: LaneRun) => ({
    ...execResult({ stdout: "cpu" }),
    id: r.id ?? "cpu-run",
    lane: r.lane,
    isolation: "process" as const,
  }));
  const executor: LaneExecutor = { run, allowed: () => true };
  return { executor, run };
}

describe("gpu lane routing (C4)", () => {
  it("declaredGpuClasses reads Runtime.md lanes and media steps", () => {
    expect(declaredGpuClasses(["ffmpeg", "gpu:L40S"])).toEqual(["L40S"]);
    expect(declaredGpuClasses(["ffmpeg"])).toEqual([]);
    expect(declaredGpuClasses(undefined)).toEqual([]);
    expect(declaredGpuClasses([], [{ gpu: "A100-80GB" }, {}])).toEqual(["A100-80GB"]);
  });

  it("heavy runtime with lanes:[gpu:L40S] routes exactly one lane to modal, the rest to cpu", async () => {
    const cpu = cpuExecutor();
    const gpuRun = vi.fn(async (r: LaneRun & { gpuClass: string }) =>
      execResult({ stdout: `gpu:${r.gpuClass}` }),
    );
    const mount = vi.fn((): GpuLaneTarget => ({ run: gpuRun }));
    const executor = createGpuLaneExecutor({
      cpu: cpu.executor,
      lanes: ["gpu:L40S", "ffmpeg"],
      mount,
    });

    const gpuResult = await executor.run({ lane: "gpu:L40S", argv: ["nvidia-smi"] });
    expect(gpuResult.isolation).toBe("gpu");
    expect(gpuResult.lane).toBe("gpu:L40S");
    expect(gpuResult.stdout).toBe("gpu:L40S");

    await executor.run({ lane: "ffmpeg", argv: ["ffmpeg", "-version"] });
    await executor.run({ lane: "ffmpeg", argv: ["ffprobe", "-version"] });

    expect(gpuRun).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledTimes(1); // lazy single mount
    expect(cpu.run).toHaveBeenCalledTimes(2);
    for (const call of cpu.run.mock.calls) {
      expect(call[0].lane).toBe("ffmpeg");
    }
  });

  it("without a gpu lane declaration, modal never mounts", async () => {
    const cpu = cpuExecutor();
    const mount = vi.fn((): GpuLaneTarget => ({ run: async () => execResult() }));
    const executor = createGpuLaneExecutor({ cpu: cpu.executor, lanes: ["ffmpeg"], mount });

    await executor.run({ lane: "ffmpeg", argv: ["ffmpeg", "-version"] });
    await expect(executor.run({ lane: "gpu:L40S", argv: ["nvidia-smi"] })).rejects.toMatchObject({
      code: "GPU_LANE_NOT_DECLARED",
    });
    expect(mount).not.toHaveBeenCalled();
    expect(executor.allowed("gpu:L40S", "nvidia-smi")).toBe(false);
  });

  it("a media step declaring gpu also mounts the lane", async () => {
    const cpu = cpuExecutor();
    const gpuRun = vi.fn(async () => execResult({ stdout: "gpu-step" }));
    const mount = vi.fn((): GpuLaneTarget => ({ run: gpuRun }));
    const executor = createGpuLaneExecutor({
      cpu: cpu.executor,
      lanes: [],
      steps: [{ gpu: "L40S" }],
      mount,
    });
    const result = await executor.run({ lane: "gpu:L40S", argv: ["nvidia-smi"] });
    expect(result.stdout).toBe("gpu-step");
    expect(mount).toHaveBeenCalledTimes(1);
  });

  it("undeclared gpu classes are refused even when another class is declared", async () => {
    const cpu = cpuExecutor();
    const mount = vi.fn((): GpuLaneTarget => ({ run: async () => execResult() }));
    const executor = createGpuLaneExecutor({ cpu: cpu.executor, lanes: ["gpu:L40S"], mount });
    await expect(executor.run({ lane: "gpu:H100", argv: ["nvidia-smi"] })).rejects.toMatchObject({
      code: "GPU_LANE_NOT_DECLARED",
    });
    expect(mount).not.toHaveBeenCalled();
  });
});
