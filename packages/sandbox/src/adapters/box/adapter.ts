import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import type {
  DoctorReport,
  ExecOptions,
  ExecResult,
  HostedPort,
  SandboxFs,
  SandboxHandle,
  SandboxProvider,
  SandboxService,
  SandboxSpec,
  SnapshotRef,
} from "../../contract.ts";
import { BOX_CAPABILITIES } from "./capabilities.ts";
import {
  createBoxClient,
  ZAP_BOX_TTL_SECONDS,
  type Box,
  type BoxClient,
  type BoxClientOptions,
  type BoxCommandResult,
} from "./client.ts";

export class BoxAdapterError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BoxAdapterError";
    this.code = code;
  }
}

/** In-VM host CLI, baked into every zap template (airv2 hermes-host pattern). */
export const BOX_HOST_CLI = "/home/user/.ascii/host";

function toExecResult(result: BoxCommandResult, startedAt: string): ExecResult {
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
}

function makeBoxFs(client: BoxClient, boxId: string, assertLive: () => void): SandboxFs {
  const resolvePath = (p: string) => (p.startsWith("/") ? p : `/workspace/${p}`);
  const encoder = new TextEncoder();
  return {
    resolve: resolvePath,
    async read(p) {
      assertLive();
      try {
        return encoder.encode(await client.readFile(boxId, resolvePath(p)));
      } catch {
        return null;
      }
    },
    async write(p, bytes) {
      assertLive();
      await client.writeFile(boxId, resolvePath(p), new TextDecoder().decode(bytes));
    },
    async readdir(p) {
      assertLive();
      const result = await client.exec(boxId, `ls -1p ${JSON.stringify(resolvePath(p))}`);
      return result.stdout
        .split("\n")
        .filter(Boolean)
        .map((name) =>
          name.endsWith("/") ? { name: name.slice(0, -1), type: "dir" as const } : { name, type: "file" as const },
        );
    },
    async remove(p, opts) {
      assertLive();
      const flags = `${opts?.recursive ? "-r " : ""}${opts?.force ? "-f " : ""}`;
      const result = await client.exec(boxId, `rm ${flags}${JSON.stringify(resolvePath(p))}`);
      if (result.exitCode !== 0 && !opts?.force) {
        throw new BoxAdapterError("REMOVE_FAILED", `remove ${p} failed: ${result.stderr}`);
      }
    },
  };
}

function parseHostOutput(stdout: string, port: number, isPrivate: boolean): HostedPort {
  const match = stdout.match(/https:\/\/\S+/);
  if (!match) throw new BoxAdapterError("HOST_PARSE_FAILED", `host CLI produced no URL for port ${port}`);
  const raw = match[0];
  const url = new URL(raw);
  const token = url.searchParams.get("_token") ?? undefined;
  url.searchParams.delete("_token");
  return { port, url: url.toString(), token, isPrivate };
}

export function createBoxHandle(client: BoxClient, box: Box, spec: SandboxSpec): SandboxHandle {
  let released = false;
  const hosted = new Map<number, HostedPort>();
  const assertLive = () => {
    if (released) throw new BoxAdapterError("SANDBOX_RELEASED", "sandbox handle was released");
  };
  const hostPort = async (port: number, isPrivate: boolean): Promise<HostedPort> => {
    const flag = isPrivate ? " --private" : "";
    const result = await client.exec(box.id, `${BOX_HOST_CLI} url ${port}${flag}`);
    if (result.exitCode !== 0) {
      throw new BoxAdapterError("HOST_FAILED", `host url ${port} exited ${result.exitCode}`);
    }
    const entry = parseHostOutput(result.stdout, port, isPrivate);
    hosted.set(port, entry);
    return entry;
  };
  return {
    id: box.id,
    provider: "box",
    capabilities: BOX_CAPABILITIES,
    fs: makeBoxFs(client, box.id, assertLive),
    async state() {
      if (released) return "stopped";
      const current = await client.get(box.id);
      if (current.state === "ready" || current.state === "idle") return "ready";
      if (current.state === "error") return "error";
      if (current.state === "archived" || current.state === "archiving") return "stopped";
      return "provisioning";
    },
    async exec(command, opts: ExecOptions = {}) {
      assertLive();
      const text = typeof command === "string" ? command : command.map((part) => JSON.stringify(part)).join(" ");
      const startedAt = new Date().toISOString();
      const timeoutSeconds = opts.timeoutMs ? Math.ceil(opts.timeoutMs / 1000) : 60;
      if (opts.detached) {
        await client.execDetached(box.id, text);
        return toExecResult({ exitCode: 0, stdout: "", stderr: "" }, startedAt);
      }
      const prefix = opts.cwd ? `cd ${JSON.stringify(opts.cwd)} && ` : "";
      const envPrefix = opts.env
        ? `${Object.entries(opts.env)
            .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
            .join(" ")} `
        : "";
      return toExecResult(await client.exec(box.id, `${prefix}${envPrefix}${text}`, timeoutSeconds), startedAt);
    },
    async snapshot(name) {
      assertLive();
      const result = await client.snapshot(box.id, name ?? `zap-${Date.now()}`);
      const ref: SnapshotRef = { provider: "box", id: result.snapshotId, name, createdAt: new Date().toISOString() };
      return ref;
    },
    async fork(forkSpec) {
      assertLive();
      const forked = await client.fork({
        templateId: box.id,
        env: forkSpec.env ?? spec.env ?? {},
        size: (forkSpec.size ?? spec.size) as "small" | "default" | "large" | undefined,
        ttlSeconds: forkSpec.ttlSeconds ?? ZAP_BOX_TTL_SECONDS,
        idempotencyKey: forkSpec.idempotencyKey,
      });
      const ready = await client.waitUntilReady(forked.id);
      return createBoxHandle(client, ready, { ...spec, ...forkSpec, provider: "box" });
    },
    async stop() {
      if (released) return;
      await client.stop(box.id);
    },
    async resume() {
      assertLive();
      await client.resume(box.id);
      await client.waitUntilReady(box.id);
      // hosted URL tokens rotate across stop/resume — re-read every port (§4.5)
      for (const [port, entry] of [...hosted]) {
        await hostPort(port, entry.isPrivate);
      }
    },
    async host(port, opts) {
      assertLive();
      return hostPort(port, opts?.private ?? false);
    },
    async desktop(opts) {
      assertLive();
      const url = await client.desktop(box.id, opts);
      if (!url) throw new BoxAdapterError("DESKTOP_UNAVAILABLE", `box ${box.id} returned no desktop URL`);
      return { url };
    },
    async remove() {
      await client.remove(box.id);
    },
    async release() {
      if (released) return;
      released = true;
      if (spec.purpose === "run" || spec.purpose === "lane") return;
      await client.stop(box.id).catch(() => undefined);
      if (spec.purpose === "test") {
        await client.remove(box.id).catch(() => undefined);
      }
    },
    async captureState() {
      return { provider: "box", metadata: { boxId: box.id, state: box.state } };
    },
  };
}

export interface BoxAdapterConfig extends BoxClientOptions {
  /** default template snapshot for new runtimes */
  template?: string;
  tenantId?: string;
  runtimeId?: string;
}

export function createBoxProvider(config: BoxAdapterConfig): SandboxProvider {
  const client = createBoxClient(config);
  return {
    id: "box",
    async capabilities() {
      return BOX_CAPABILITIES;
    },
    async acquire(spec) {
      if (spec.existing) {
        const box = await client.get(spec.existing.id);
        const resumed = box.state === "ready" || box.state === "idle" ? box : (await client.resume(box.id), await client.waitUntilReady(box.id));
        return createBoxHandle(client, resumed, spec);
      }
      const template = spec.template ?? config.template;
      if (!template) {
        throw new BoxAdapterError("TEMPLATE_REQUIRED", "box acquire requires spec.template or a configured default");
      }
      const box = await client.fork({
        templateId: template,
        env: spec.env ?? {},
        size: spec.size as "small" | "default" | "large" | undefined,
        ttlSeconds: spec.ttlSeconds,
        idempotencyKey: spec.idempotencyKey,
      });
      const ready = await client.waitUntilReady(box.id);
      if (config.tenantId && config.runtimeId) {
        await client.rename(ready.id, `zap-${config.tenantId}-${config.runtimeId}`).catch(() => undefined);
      }
      return createBoxHandle(client, ready, spec);
    },
    async doctor(): Promise<DoctorReport> {
      const hasKey = Boolean(config.apiKey?.trim());
      return {
        provider: "box",
        ok: hasKey,
        checks: [
          {
            id: "box.api_key",
            ok: hasKey,
            required: true,
            detail: hasKey ? "BOX_API_KEY configured" : "missing BOX_API_KEY",
            remediation: hasKey ? undefined : "set BOX_API_KEY or configure the managed credential bridge",
          },
          { id: "box.default", ok: true, required: false, detail: "box is the default sandbox provider" },
        ],
      };
    },
  };
}

const schema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().optional(),
  template: z.string().optional(),
  tenantId: z.string().optional(),
  runtimeId: z.string().optional(),
}) as z.ZodType<BoxAdapterConfig>;

/** `sandbox.box` — the default Zap sandbox adapter (ascii.dev Box). */
export const boxAdapter = definePlugin<BoxAdapterConfig>({
  name: "sandbox.box",
  inject: ["sandbox"],
  optionalInject: ["meter"],
  schema,
  async apply(ctx, config) {
    const sandbox = await ctx.inject<SandboxService>("sandbox");
    const provider = createBoxProvider(config);
    await ctx.effect(() => sandbox.register(provider));
  },
});
