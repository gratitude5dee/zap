import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import type {
  DoctorReport,
  ExecOptions,
  ExecResult,
  SandboxCapabilities,
  SandboxFs,
  SandboxHandle,
  SandboxProvider,
  SandboxService,
  SandboxSpec,
} from "../../contract.ts";

export class DockerSandboxError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DockerSandboxError";
    this.code = code;
  }
}

export const DOCKER_CAPABILITIES: SandboxCapabilities = {
  exec: true,
  files: true,
  readdir: true,
  detached: false,
  snapshot: false,
  fork: false,
  stop: true,
  resume: true,
  ports: false,
  privatePorts: false,
  desktop: false,
  ssh: false,
  networkPolicy: "allow-deny",
  gpu: false,
  kvm: false,
  docker: true,
  isolation: "container",
  sizes: ["default"],
  maxCommandSeconds: 3600,
};

/** Structural slice of the dockerode surface this adapter uses (no Eve imports — C29). */
export interface DockerodeExecLike {
  start(opts: { hijack?: boolean; stdin?: boolean }): Promise<NodeJS.ReadableStream>;
  inspect(): Promise<{ ExitCode: number | null }>;
}

export interface DockerodeContainerLike {
  id: string;
  start(): Promise<unknown>;
  stop(opts?: { t?: number }): Promise<unknown>;
  remove(opts?: { force?: boolean }): Promise<unknown>;
  inspect(): Promise<{ State: { Running: boolean; Status: string } }>;
  exec(opts: {
    Cmd: string[];
    AttachStdout: boolean;
    AttachStderr: boolean;
    WorkingDir?: string;
    Env?: string[];
  }): Promise<DockerodeExecLike>;
}

export interface DockerodeLike {
  createContainer(opts: {
    Image: string;
    Cmd: string[];
    Tty: boolean;
    Labels?: Record<string, string>;
    HostConfig?: { AutoRemove?: boolean };
  }): Promise<DockerodeContainerLike>;
  ping(): Promise<unknown>;
}

export interface DockerAdapterConfig {
  /** container image for new sandboxes */
  image?: string;
  /** injected client for tests; defaults to a lazy `dockerode` import */
  client?: DockerodeLike;
}

export const DOCKER_DEFAULT_IMAGE = "node:24-bookworm-slim";

async function loadDocker(config?: DockerAdapterConfig): Promise<DockerodeLike> {
  if (config?.client) return config.client;
  // optional dependency — resolved at runtime only, so a non-literal specifier
  const specifier = "dockerode";
  const mod = (await import(specifier)) as { default: new () => DockerodeLike };
  return new mod.default();
}

async function collectStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  // dockerode multiplexed streams frame stdout/stderr with an 8-byte header
  const raw = Buffer.concat(chunks);
  let text = "";
  let offset = 0;
  while (offset + 8 <= raw.length) {
    const type = raw[offset];
    if (type !== 1 && type !== 2) break;
    const length = raw.readUInt32BE(offset + 4);
    text += raw.subarray(offset + 8, offset + 8 + length).toString();
    offset += 8 + length;
  }
  return offset > 0 ? text : raw.toString();
}

async function dockerExec(
  container: DockerodeContainerLike,
  argv: string[],
  opts: ExecOptions,
): Promise<ExecResult> {
  const startedAt = new Date().toISOString();
  const exec = await container.exec({
    Cmd: argv,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: opts.cwd,
    Env: opts.env ? Object.entries(opts.env).map(([key, value]) => `${key}=${value}`) : undefined,
  });
  const stream = await exec.start({ hijack: true });
  let timedOut = false;
  const output = await (opts.timeoutMs
    ? Promise.race([
        collectStream(stream),
        new Promise<string>((resolvePromise) =>
          setTimeout(() => {
            timedOut = true;
            resolvePromise("");
          }, opts.timeoutMs),
        ),
      ])
    : collectStream(stream));
  const inspected = await exec.inspect();
  return {
    exitCode: timedOut ? 124 : (inspected.ExitCode ?? 1),
    stdout: output,
    stderr: "",
    timedOut,
    truncated: false,
    startedAt,
    finishedAt: new Date().toISOString(),
    usage: { bytesIn: 0, bytesOut: output.length },
  };
}

function makeDockerFs(container: DockerodeContainerLike, assertLive: () => void): SandboxFs {
  const resolvePath = (p: string) => (p.startsWith("/") ? p : `/workspace/${p}`);
  return {
    resolve: resolvePath,
    async read(p) {
      assertLive();
      const result = await dockerExec(container, ["cat", resolvePath(p)], {});
      return result.exitCode === 0 ? new TextEncoder().encode(result.stdout) : null;
    },
    async write(p, bytes) {
      assertLive();
      const abs = resolvePath(p);
      const b64 = Buffer.from(bytes).toString("base64");
      const result = await dockerExec(
        container,
        ["sh", "-c", `mkdir -p "$(dirname '${abs}')" && printf '%s' '${b64}' | base64 -d > '${abs}'`],
        {},
      );
      if (result.exitCode !== 0) {
        throw new DockerSandboxError("WRITE_FAILED", `write ${p} failed: ${result.stdout}`);
      }
    },
    async readdir(p) {
      assertLive();
      const result = await dockerExec(container, ["ls", "-1p", resolvePath(p)], {});
      return result.stdout
        .split("\n")
        .filter(Boolean)
        .map((name) =>
          name.endsWith("/")
            ? { name: name.slice(0, -1), type: "dir" as const }
            : { name, type: "file" as const },
        );
    },
    async remove(p, opts) {
      assertLive();
      const argv = ["rm", ...(opts?.recursive ? ["-r"] : []), ...(opts?.force ? ["-f"] : []), resolvePath(p)];
      const result = await dockerExec(container, argv, {});
      if (result.exitCode !== 0 && !opts?.force) {
        throw new DockerSandboxError("REMOVE_FAILED", `remove ${p} failed`);
      }
    },
  };
}

function makeDockerHandle(container: DockerodeContainerLike, spec: SandboxSpec): SandboxHandle {
  let released = false;
  const assertLive = () => {
    if (released) throw new DockerSandboxError("SANDBOX_RELEASED", "sandbox handle was released");
  };
  return {
    id: container.id,
    provider: "docker",
    capabilities: DOCKER_CAPABILITIES,
    fs: makeDockerFs(container, assertLive),
    async state() {
      if (released) return "stopped";
      const inspected = await container.inspect();
      return inspected.State.Running ? "ready" : "stopped";
    },
    async exec(command, opts = {}) {
      assertLive();
      const argv = typeof command === "string" ? ["bash", "-lc", command] : [...command];
      return dockerExec(container, argv, opts);
    },
    async stop() {
      if (released) return;
      await container.stop({ t: 10 });
    },
    async resume() {
      assertLive();
      await container.start();
    },
    async remove() {
      await container.remove({ force: true });
    },
    async release() {
      if (released) return;
      released = true;
      if (spec.purpose === "run" || spec.purpose === "lane") return;
      await container.stop({ t: 10 }).catch(() => undefined);
      if (spec.purpose === "test") {
        await container.remove({ force: true }).catch(() => undefined);
      }
    },
    async captureState() {
      return { provider: "docker", metadata: { containerId: container.id } };
    },
  };
}

export function createDockerProvider(config?: DockerAdapterConfig): SandboxProvider {
  return {
    id: "docker",
    async capabilities() {
      return DOCKER_CAPABILITIES;
    },
    async acquire(spec) {
      const docker = await loadDocker(config);
      const container = await docker.createContainer({
        Image: spec.template ?? config?.image ?? DOCKER_DEFAULT_IMAGE,
        Cmd: ["sleep", "infinity"],
        Tty: false,
        Labels: { "dev.wzrd.zap.purpose": spec.purpose, ...spec.tags },
      });
      await container.start();
      await dockerExec(container, ["mkdir", "-p", "/workspace"], {});
      return makeDockerHandle(container, spec);
    },
    async doctor(): Promise<DoctorReport> {
      let ok = false;
      let detail = "docker daemon reachable";
      try {
        const docker = await loadDocker(config);
        await docker.ping();
        ok = true;
      } catch (error) {
        detail = error instanceof Error ? error.message : String(error);
      }
      return {
        provider: "docker",
        ok,
        checks: [{ id: "docker.daemon", ok, required: true, detail }],
      };
    },
  };
}

const schema = z.object({ image: z.string().optional() }).optional() as z.ZodType<DockerAdapterConfig | undefined>;

/** `sandbox.docker` — local dev containers on dockerode. */
export const dockerAdapter = definePlugin<DockerAdapterConfig | undefined>({
  name: "sandbox.docker",
  inject: ["sandbox"],
  schema,
  async apply(ctx, config) {
    const sandbox = await ctx.inject<SandboxService>("sandbox");
    const provider = createDockerProvider(config);
    await ctx.effect(() => sandbox.register(provider));
  },
});
