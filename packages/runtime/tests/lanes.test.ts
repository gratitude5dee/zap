// Lane executor + zap-agentd lane route — §13 session B.
import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentdApp, AgentdRouteModule } from "../src/agentd/routes.ts";
import { createAgentdServer } from "../src/agentd/serve.ts";
import { createLaneExecutor, isLaneAllowed, LANE_ALLOWLISTS } from "../src/lanes/index.ts";

describe("lane allowlists", () => {
  it("allows ffprobe on the ffmpeg lane and refuses everything else", () => {
    expect(isLaneAllowed("ffmpeg", "ffprobe")).toBe(true);
    expect(isLaneAllowed("ffmpeg", "/usr/bin/ffprobe")).toBe(true);
    expect(isLaneAllowed("ffmpeg", "bash")).toBe(false);
    expect(LANE_ALLOWLISTS.codegen).toContain("node");
  });
});

describe("lane executor", () => {
  it("refuses a disallowed binary with exit 126 without executing", async () => {
    const lanes = createLaneExecutor();
    const result = await lanes.run({ lane: "ffmpeg", argv: ["bash", "-c", "echo pwned > /tmp/lane-pwned"] });
    expect(result.exitCode).toBe(126);
    expect(await readFile("/tmp/lane-pwned", "utf8").catch(() => null)).toBeNull();
  });

  it("runs an allowed argv and records the run", async () => {
    const runsDir = mkdtempSync(path.join(tmpdir(), "zap-runs-"));
    const records: unknown[] = [];
    const lanes = createLaneExecutor({ runsDir, isolation: "process", onRecord: (r) => records.push(r) });
    const result = await lanes.run({ lane: "codegen", argv: ["node", "-e", "console.log('lane-ok')"] });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("lane-ok");
    expect(result.isolation).toBe("process");
    expect(records).toHaveLength(1);
    const done = await readFile(path.join(runsDir, "done", `${result.id}.json`), "utf8");
    expect(JSON.parse(done).lane).toBe("codegen");
  });

  it("dry-run returns the argv without executing", async () => {
    const lanes = createLaneExecutor({ dryRun: true });
    const result = await lanes.run({ lane: "codegen", argv: ["node", "-e", "process.exit(1)"] });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).dryRun).toBe(true);
  });
});

describe("zap-agentd", () => {
  function makeServer() {
    const fsRoot = mkdtempSync(path.join(tmpdir(), "zap-agentd-"));
    return createAgentdServer({ token: "test-token", fsRoot, lanes: createLaneExecutor() });
  }

  it("rejects requests without the bearer", async () => {
    const agentd = makeServer();
    const response = await agentd.handle({ method: "GET", path: "/v1/capabilities", params: {}, query: {}, headers: {} });
    expect(response.status).toBe(401);
    const health = await agentd.handle({ method: "GET", path: "/v1/health", params: {}, query: {}, headers: {} });
    expect(health.status).toBe(200);
  });

  it("POST /v1/lane dryRun returns argv + estimate without executing", async () => {
    const agentd = makeServer();
    const response = await agentd.handle({
      method: "POST",
      path: "/v1/lane",
      params: {},
      query: {},
      headers: { authorization: "Bearer test-token" },
      body: { lane: "ffmpeg", argv: ["ffprobe", "-v", "error", "-show_format", "in.mp4"], dryRun: true },
    });
    expect(response.status).toBe(200);
    const body = response.body as { dryRun: boolean; argv: string[]; estimate: { unit: string } };
    expect(body.dryRun).toBe(true);
    expect(body.argv[0]).toBe("ffprobe");
    expect(body.estimate.unit).toBe("cpu-seconds");
  });

  it("POST /v1/lane refuses a disallowed binary with exit 126", async () => {
    const agentd = makeServer();
    const response = await agentd.handle({
      method: "POST",
      path: "/v1/lane",
      params: {},
      query: {},
      headers: { authorization: "Bearer test-token" },
      body: { lane: "ffmpeg", argv: ["bash", "-c", "true"] },
    });
    expect((response.body as { exitCode: number }).exitCode).toBe(126);
  });

  it("exec and files round-trip inside the fs root", async () => {
    const agentd = makeServer();
    const auth = { authorization: "Bearer test-token" };
    const put = await agentd.handle({
      method: "PUT",
      path: "/v1/files",
      params: {},
      query: {},
      headers: auth,
      body: { path: "notes/a.txt", content: "hello" },
    });
    expect(put.status).toBe(200);
    const get = await agentd.handle({
      method: "GET",
      path: "/v1/files",
      params: {},
      query: { path: "notes/a.txt" },
      headers: auth,
    });
    expect((get.body as { content: string }).content).toBe("hello");
    const exec = await agentd.handle({
      method: "POST",
      path: "/v1/exec",
      params: {},
      query: {},
      headers: auth,
      body: { command: "cat notes/a.txt" },
    });
    expect((exec.body as { stdout: string }).stdout).toBe("hello");
  });

  it("mounts route modules and honours the --serve-agents gate", async () => {
    const fsRoot = mkdtempSync(path.join(tmpdir(), "zap-agentd-"));
    const mounted: string[] = [];
    const module: AgentdRouteModule = {
      prefix: "/v1/agents",
      mount(app: AgentdApp) {
        mounted.push("agents");
        app.route("GET", "/v1/agents/ping", () => ({ status: 200, body: { pong: true } }));
        return async () => undefined;
      },
    };
    const gated = createAgentdServer({
      token: "t",
      fsRoot,
      lanes: createLaneExecutor(),
      routeModules: [module],
      serveAgents: false,
      ctx: {} as never,
    });
    expect(mounted).toHaveLength(0);
    const ungated = createAgentdServer({
      token: "t",
      fsRoot,
      lanes: createLaneExecutor(),
      routeModules: [module],
      serveAgents: true,
      ctx: {} as never,
    });
    expect(mounted).toEqual(["agents"]);
    const ping = await ungated.handle({
      method: "GET",
      path: "/v1/agents/ping",
      params: {},
      query: {},
      headers: { authorization: "Bearer t" },
    });
    expect((ping.body as { pong: boolean }).pong).toBe(true);
    await gated.close().catch(() => undefined);
  });
});
