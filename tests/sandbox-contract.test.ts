import { afterEach, describe, expect, it, vi } from "vitest";
import type { SandboxBackend, SandboxSession } from "eve/sandbox";
import { createVendorBackend } from "../packages/sandbox-adapters/src/backend";
import { resolveSandboxBackend, withBoxLifecycleCompatibility } from "../packages/sandbox-adapters/src";
import type { SandboxDriver } from "../packages/sandbox-adapters/src/session";

afterEach(() => vi.restoreAllMocks());

describe("sandbox adapter contract", () => {
  it("runs the canonical fixture through the shared vendor adapter", async () => {
    const driver = memoryDriver();
    const backend = createVendorBackend({
      createDriver: async () => driver,
      name: "contract-memory",
      templateName: (key) => key,
    });
    await exerciseBackend(backend);
    expect(driver.shutdown).toHaveBeenCalledTimes(1);
  });

  it("normalizes the legacy ascii Box dispose lifecycle to Eve shutdown", async () => {
    const dispose = vi.fn(async () => undefined);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 202 }));
    const backend = withBoxLifecycleCompatibility({
      name: "ascii-box",
      async prewarm() { return { reused: false }; },
      async create() {
        return {
          captureState: async () => ({ backendName: "ascii-box", metadata: { boxId: "bx_contract" }, sessionKey: "contract" }),
          dispose,
          session: {} as SandboxSession,
          useSessionFn: async () => ({} as SandboxSession),
        } as never;
      },
    }, "box_service_key");

    const handle = await backend.create({
      runtimeContext: { appRoot: process.cwd() },
      sessionKey: "contract",
      tags: {},
      templateKey: null,
    });
    await handle.shutdown();

    expect(dispose).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ascii.dev/api/box/v1/boxes/bx_contract/stop",
      expect.objectContaining({ headers: { authorization: "Bearer box_service_key" }, method: "POST" }),
    );
  });

  for (const target of hostedTargets) {
    const enabled = process.env.RUN_HOSTED_SANDBOX_TESTS === "1" && target.credentials.some((key) => Boolean(process.env[key]));
    const live = enabled ? it : it.skip;
    live(`runs the canonical fixture on hosted ${target.name}`, async () => {
      await exerciseBackend(resolveSandboxBackend({
        ...process.env,
        ZAP_SANDBOX_BACKEND: target.name,
      }));
    }, 180_000);
  }

  const dockerLive = process.env.RUN_LOCAL_SANDBOX_TESTS === "1" ? it : it.skip;
  dockerLive("runs the canonical fixture on local Docker", async () => {
    await exerciseBackend(resolveSandboxBackend({ ...process.env, ZAP_SANDBOX_BACKEND: "docker" }));
  }, 180_000);
});

const hostedTargets = [
  { credentials: ["VERCEL_OIDC_TOKEN", "VERCEL_TOKEN"], name: "vercel" },
  { credentials: ["BOX_API_KEY"], name: "box" },
  { credentials: ["DAYTONA_API_KEY"], name: "daytona" },
  { credentials: ["E2B_API_KEY"], name: "e2b" },
] as const;

async function exerciseBackend(backend: SandboxBackend) {
  const handle = await backend.create({
    runtimeContext: { appRoot: process.cwd() },
    sessionKey: `contract-${backend.name}-${Date.now()}`,
    tags: { suite: "zap-sandbox-contract" },
    templateKey: null,
  });
  try {
    await runFixture(handle.session);
    const state = await handle.captureState();
    expect(state.backendName).toBe(backend.name);
    expect(state.sessionKey).toContain("contract-");
  } finally {
    await handle.shutdown();
  }
}

async function runFixture(session: SandboxSession) {
  expect(session.resolvePath("fixture/input.txt")).toBe("/workspace/fixture/input.txt");
  expect((await session.run({ command: "mkdir -p fixture" })).exitCode).toBe(0);
  await session.writeTextFile({ content: "zap", path: "fixture/input.txt" });
  const result = await session.run({
    command: "tr '[:lower:]' '[:upper:]' < input.txt > output.txt && printf ':%s' \"$CONTRACT_SUFFIX\" >> output.txt",
    env: { CONTRACT_SUFFIX: "ready" },
    workingDirectory: "fixture",
  });
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(await session.readTextFile({ path: "fixture/output.txt" })).toBe("ZAP:ready");
  await session.removePath({ path: "fixture", recursive: true });
  expect(await session.readTextFile({ path: "fixture/output.txt" })).toBeNull();
}

function memoryDriver(): SandboxDriver {
  const files = new Map<string, Uint8Array>();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  return {
    id: "contract-memory-1",
    async read(remotePath) {
      return files.get(remotePath) ?? null;
    },
    async remove(remotePath) {
      for (const key of files.keys()) {
        if (key === remotePath || key.startsWith(`${remotePath}/`)) files.delete(key);
      }
    },
    async run(input) {
      if (input.command === "mkdir -p fixture") return { exitCode: 0, stderr: "", stdout: "" };
      const cwd = input.workingDirectory ?? "/workspace";
      const source = files.get(`${cwd}/input.txt`);
      if (!source) return { exitCode: 1, stderr: "input missing", stdout: "" };
      files.set(`${cwd}/output.txt`, encoder.encode(`${decoder.decode(source).toUpperCase()}:${input.env?.CONTRACT_SUFFIX ?? ""}`));
      return { exitCode: 0, stderr: "", stdout: "" };
    },
    shutdown: vi.fn(async () => undefined),
    async write(remotePath, content) {
      files.set(remotePath, content);
    },
  };
}
