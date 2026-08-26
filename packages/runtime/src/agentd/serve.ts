import { spawn } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Context, Disposer } from "@wzrdtech/zap-kernel";
import type { LaneExecutor, LaneId } from "@wzrdtech/zap-sandbox";
import { redact } from "../redact.ts";
import type { AgentdApp, AgentdRequest, AgentdResponse, AgentdRouteModule } from "./routes.ts";

/**
 * zap-agentd — the in-VM lane executor daemon. Binds 0.0.0.0:8722 everywhere
 * (Box hosted routes, Namespace ingress, and the macOS bridge all reach it
 * from outside the process; never loopback for a hosted service) and is
 * protected by its bearer token, not by its bind address.
 */
export const AGENTD_PORT = 8722;
export const AGENTD_HOST = "0.0.0.0";
export const AGENTD_FS_ROOT = "/zap/fs";

export interface AgentdOptions {
  /** RUNTIME_TOKEN inside Box/Namespace runtimes; ZAP_SELFHOST_TOKEN on a VPS */
  token: string;
  port?: number;
  host?: string;
  fsRoot?: string;
  lanes: LaneExecutor;
  /**
   * Route-module convention: later sessions mount extra prefixes here —
   * /v1/runs (session E) and the agent host (session K, behind
   * `--serve-agents`) plug in as AgentdRouteModule values.
   */
  routeModules?: readonly AgentdRouteModule[];
  /** the `zap-agentd serve --serve-agents` flag hook (session K) */
  serveAgents?: boolean;
  ctx?: Context;
  log?: (line: string) => void;
}

interface RouteEntry {
  method: string;
  path: string;
  handler: (req: AgentdRequest) => Promise<AgentdResponse> | AgentdResponse;
}

function json(status: number, body: unknown): AgentdResponse {
  return { status, headers: { "content-type": "application/json" }, body };
}

/** constant-time bearer comparison; hashing first equalizes lengths */
function bearerMatches(header: string, token: string): boolean {
  const given = createHash("sha256").update(header).digest();
  const expected = createHash("sha256").update(`Bearer ${token}`).digest();
  return timingSafeEqual(given, expected);
}

function execBash(
  command: string,
  opts: { cwd?: string; env?: Record<string, string>; timeoutMs?: number },
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolvePromise) => {
    const child = spawn("bash", ["-lc", command], {
      cwd: opts.cwd,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: process.env.HOME ?? "/tmp",
        ...opts.env,
      },
      stdio: ["ignore", "pipe", "pipe"] as const,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : undefined;
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolvePromise({ exitCode: timedOut ? 124 : (code ?? 1), stdout, stderr, timedOut });
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      resolvePromise({ exitCode: 127, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
  });
}

export interface AgentdServer {
  app: AgentdApp;
  server: Server;
  listen(): Promise<{ port: number }>;
  close(): Promise<void>;
  /** dispatch one request in-process (tests use this; no socket needed) */
  handle(req: AgentdRequest): Promise<AgentdResponse>;
}

export function createAgentdServer(options: AgentdOptions): AgentdServer {
  if (!options.token?.trim()) {
    throw new Error("zap-agentd requires a bearer token (RUNTIME_TOKEN or ZAP_SELFHOST_TOKEN)");
  }
  const fsRoot = options.fsRoot ?? AGENTD_FS_ROOT;
  const log = options.log ?? ((line: string) => process.stderr.write(`${redact(line)}\n`));
  const routes: RouteEntry[] = [];
  const app: AgentdApp = {
    route(method, routePath, handler) {
      routes.push({ method, path: routePath, handler });
    },
  };

  const resolveFsPath = (p: string): string => {
    const abs = path.resolve(fsRoot, p.startsWith("/") ? `.${p}` : p);
    if (abs !== fsRoot && !abs.startsWith(`${fsRoot}${path.sep}`)) {
      throw new Error(`path ${p} escapes ${fsRoot}`);
    }
    return abs;
  };

  app.route("GET", "/v1/health", () => json(200, { ok: true, service: "zap-agentd" }));

  app.route("GET", "/v1/capabilities", () =>
    json(200, {
      service: "zap-agentd",
      port: options.port ?? AGENTD_PORT,
      fsRoot,
      lanes: ["codegen", "ffmpeg", "media-workflows", "browser", "wasm"],
      serveAgents: options.serveAgents ?? false,
      routes: routes.map((route) => `${route.method} ${route.path}`),
    }),
  );

  app.route("POST", "/v1/exec", async (req) => {
    const body = (req.body ?? {}) as { command?: string; cwd?: string; env?: Record<string, string>; timeoutMs?: number };
    if (!body.command) return json(400, { error: "command required" });
    const cwd = body.cwd ? resolveFsPath(body.cwd) : fsRoot;
    await mkdir(cwd, { recursive: true });
    const result = await execBash(body.command, { cwd, env: body.env, timeoutMs: body.timeoutMs });
    return json(200, result);
  });

  app.route("POST", "/v1/lane", async (req) => {
    const body = (req.body ?? {}) as {
      lane?: LaneId;
      argv?: string[];
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
      dryRun?: boolean;
    };
    if (!body.lane || !Array.isArray(body.argv) || body.argv.length === 0) {
      return json(400, { error: "lane and argv required" });
    }
    if (!options.lanes.allowed(body.lane, body.argv[0])) {
      // refused before anything executes — exit 126
      return json(200, {
        exitCode: 126,
        stdout: "",
        stderr: `lane ${body.lane}: binary ${body.argv[0]} is not on the allowlist`,
        timedOut: false,
      });
    }
    if (body.dryRun) {
      return json(200, {
        dryRun: true,
        lane: body.lane,
        argv: body.argv,
        estimate: { unit: "cpu-seconds", qty: Math.ceil((body.timeoutMs ?? 60_000) / 1000) },
      });
    }
    const result = await options.lanes.run({
      lane: body.lane,
      argv: body.argv,
      cwd: body.cwd ? resolveFsPath(body.cwd) : undefined,
      env: body.env,
      timeoutMs: body.timeoutMs,
    });
    return json(200, {
      id: result.id,
      lane: result.lane,
      isolation: result.isolation,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut: result.timedOut,
    });
  });

  app.route("GET", "/v1/files", async (req) => {
    const target = req.query.path;
    if (!target) return json(400, { error: "path required" });
    const abs = resolveFsPath(target);
    if (req.query.list === "1") {
      try {
        const entries = await readdir(abs, { withFileTypes: true });
        const out: Array<{ name: string; type: "file" | "dir" | "symlink"; size?: number }> = [];
        for (const entry of entries) {
          const type = entry.isDirectory() ? "dir" : entry.isSymbolicLink() ? "symlink" : "file";
          const size = type === "file" ? (await stat(path.join(abs, entry.name))).size : undefined;
          out.push({ name: entry.name, type, size });
        }
        return json(200, { entries: out });
      } catch {
        return json(404, { error: "not found" });
      }
    }
    try {
      const content = await readFile(abs, "utf8");
      return json(200, { content });
    } catch {
      return json(200, { content: null });
    }
  });

  app.route("PUT", "/v1/files", async (req) => {
    const body = (req.body ?? {}) as { path?: string; content?: string };
    if (!body.path || body.content === undefined) return json(400, { error: "path and content required" });
    const abs = resolveFsPath(body.path);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, body.content);
    return json(200, { ok: true });
  });

  app.route("DELETE", "/v1/files", async (req) => {
    const body = (req.body ?? {}) as { path?: string; recursive?: boolean; force?: boolean };
    if (!body.path) return json(400, { error: "path required" });
    await rm(resolveFsPath(body.path), { recursive: body.recursive ?? false, force: body.force ?? false });
    return json(200, { ok: true });
  });

  const disposers: Disposer[] = [];
  for (const routeModule of options.routeModules ?? []) {
    if (routeModule.prefix === "/v1/agents" && !options.serveAgents) continue;
    if (options.ctx) disposers.push(routeModule.mount(app, options.ctx));
  }

  async function handle(req: AgentdRequest): Promise<AgentdResponse> {
    if (req.path !== "/v1/health") {
      const auth = req.headers.authorization ?? "";
      if (!bearerMatches(auth, options.token)) {
        return json(401, { error: "unauthorized" });
      }
    }
    const route = routes.find((entry) => entry.method === req.method && entry.path === req.path);
    if (!route) return json(404, { error: `no route for ${req.method} ${req.path}` });
    try {
      return await route.handler(req);
    } catch (error) {
      log(`agentd ${req.method} ${req.path} failed: ${error instanceof Error ? error.message : String(error)}`);
      return json(500, { error: "internal error" });
    }
  }

  const server = createServer(async (incoming: IncomingMessage, response: ServerResponse) => {
    const url = new URL(incoming.url ?? "/", "http://agentd");
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    let body: unknown;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = undefined;
      }
    }
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (typeof value === "string") headers[key.toLowerCase()] = value;
    }
    const query: Record<string, string> = {};
    for (const [key, value] of url.searchParams) query[key] = value;
    const result = await handle({
      method: incoming.method ?? "GET",
      path: url.pathname,
      params: {},
      query,
      headers,
      body,
    });
    response.writeHead(result.status, result.headers ?? { "content-type": "application/json" });
    response.end(typeof result.body === "string" ? result.body : JSON.stringify(result.body ?? {}));
  });

  return {
    app,
    server,
    handle,
    listen() {
      return new Promise((resolvePromise) => {
        server.listen(options.port ?? AGENTD_PORT, options.host ?? AGENTD_HOST, () => {
          const address = server.address();
          const port = typeof address === "object" && address ? address.port : (options.port ?? AGENTD_PORT);
          log(`zap-agentd listening on ${options.host ?? AGENTD_HOST}:${port}`);
          resolvePromise({ port });
        });
      });
    },
    async close() {
      for (const dispose of disposers.reverse()) await dispose();
      await new Promise<void>((resolvePromise, reject) =>
        server.close((error) => (error ? reject(error) : resolvePromise())),
      );
    },
  };
}
