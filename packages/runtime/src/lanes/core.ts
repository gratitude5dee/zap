import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import type { ExecResult, LaneExecutor, LaneId, LaneRun, SandboxCapabilities } from "@wzrdtech/zap-sandbox";
import { isLaneAllowed } from "./allowlists.ts";

export class LaneError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LaneError";
    this.code = code;
  }
}

export type LaneIsolation = SandboxCapabilities["isolation"] | "gpu";

export interface LaneRunRecord {
  id: string;
  lane: LaneId;
  argv: readonly string[];
  isolation: LaneIsolation;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  usage: ExecResult["usage"];
}

export interface LaneExecutorOptions {
  /** run logs and done markers root; /zap/runs in production */
  runsDir?: string;
  /**
   * process confinement wrapper prepended to the argv when set — systemd-run
   * on Box/selfhost hosts, msb on KVM. Empty = plain child process.
   */
  confinement?: readonly string[];
  /** isolation recorded for each run; "process" under systemd-run */
  isolation?: LaneIsolation;
  /** dry-run: return the argv + estimate without executing */
  dryRun?: boolean;
  onRecord?: (record: LaneRunRecord) => void;
}

export const LANE_RUNS_DIR = "/zap/runs";

function spawnLane(argv: readonly string[], run: LaneRun): Promise<ExecResult> {
  return new Promise((resolvePromise) => {
    const startedAt = new Date().toISOString();
    const child = spawn(argv[0], argv.slice(1), {
      cwd: run.cwd,
      env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH ?? "/usr/bin:/bin", ...run.env },
      stdio: ["ignore", "pipe", "pipe"] as const,
      signal: run.signal,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = run.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, run.timeoutMs)
      : undefined;
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolvePromise({
        exitCode: timedOut ? 124 : (code ?? 1),
        stdout,
        stderr,
        timedOut,
        truncated: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        usage: { bytesIn: 0, bytesOut: stdout.length + stderr.length },
      });
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      resolvePromise({
        exitCode: 127,
        stdout,
        stderr: `${stderr}${error.message}`,
        timedOut,
        truncated: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        usage: { bytesIn: 0, bytesOut: 0 },
      });
    });
  });
}

export function createLaneExecutor(options?: LaneExecutorOptions): LaneExecutor {
  const isolation: LaneIsolation = options?.isolation ?? "process";
  return {
    allowed: (lane, argv0) => isLaneAllowed(lane, argv0),
    async run(run: LaneRun) {
      const id = run.id ?? randomUUID();
      const startedAt = new Date().toISOString();
      if (run.argv.length === 0) {
        throw new LaneError("EMPTY_ARGV", "lane run requires a non-empty argv");
      }
      if (run.lane.startsWith("gpu:")) {
        throw new LaneError("GPU_LANE_UNAVAILABLE", "gpu lanes are provided by lanes/gpu (session G)");
      }
      if (!isLaneAllowed(run.lane, run.argv[0])) {
        // refused before any process starts — exit 126, nothing executed
        const finishedAt = new Date().toISOString();
        return {
          id,
          lane: run.lane,
          isolation,
          exitCode: 126,
          stdout: "",
          stderr: `lane ${run.lane}: binary ${run.argv[0]} is not on the allowlist`,
          timedOut: false,
          truncated: false,
          startedAt,
          finishedAt,
          usage: { bytesIn: 0, bytesOut: 0 },
        };
      }
      if (options?.dryRun) {
        return {
          id,
          lane: run.lane,
          isolation,
          exitCode: 0,
          stdout: JSON.stringify({ dryRun: true, argv: run.argv, lane: run.lane, isolation }),
          stderr: "",
          timedOut: false,
          truncated: false,
          startedAt,
          finishedAt: new Date().toISOString(),
          usage: { bytesIn: 0, bytesOut: 0 },
        };
      }
      const argv = [...(options?.confinement ?? []), ...run.argv];
      const result = await spawnLane(argv, run);
      const record: LaneRunRecord = {
        id,
        lane: run.lane,
        argv: run.argv,
        isolation,
        exitCode: result.exitCode,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        usage: result.usage,
      };
      options?.onRecord?.(record);
      if (options?.runsDir) {
        const doneDir = path.join(options.runsDir, "done");
        await mkdir(doneDir, { recursive: true });
        await writeFile(path.join(options.runsDir, `${id}.log`), `${result.stdout}${result.stderr}`);
        await writeFile(path.join(doneDir, `${id}.json`), JSON.stringify(record, null, 2));
      }
      return { ...result, id, lane: run.lane, isolation };
    },
  };
}

const schema = z
  .object({
    runsDir: z.string().optional(),
    confinement: z.array(z.string()).optional(),
    isolation: z.string().optional(),
    dryRun: z.boolean().optional(),
  })
  .optional() as z.ZodType<LaneExecutorOptions | undefined>;

/** `lanes.core` — provides the `lanes` service (LaneExecutor). */
export const lanesCore = definePlugin<LaneExecutorOptions | undefined>({
  name: "lanes.core",
  schema,
  async apply(ctx, config) {
    const executor = createLaneExecutor(config);
    await ctx.effect(() => ctx.provide("lanes", executor));
  },
});
