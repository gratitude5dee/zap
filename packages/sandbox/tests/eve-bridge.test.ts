// Eve bridge parity (goal §5.3.6) — resolveSandboxBackend routes v5 ids over
// the @wzrdtech/zap-sandbox contract while box-legacy/vercel/auto bypass it.
import { afterEach, describe, expect, it } from "vitest";
import {
  eveBackendFromProvider,
  resetSandboxBridge,
  resolveSandboxBackend,
  ZAP_SANDBOX_BACKENDS,
} from "../../sandbox-adapters/src/index";
import { createFakeProvider, createSandboxService, type SandboxService } from "../src/index.ts";

afterEach(() => resetSandboxBridge());

function fakeService(): SandboxService {
  const service = createSandboxService({ default: "fake" });
  service.register(createFakeProvider({ env: { ZAP_ALLOW_FAKE_SANDBOX: "1" } }));
  return service;
}

const runtimeContext = { appRoot: "/tmp" };

describe("eve bridge", () => {
  it("keeps every 0.3.1 backend name and adds the v5 ids", () => {
    for (const name of ["vercel", "box", "daytona", "e2b", "docker", "auto"]) {
      expect(ZAP_SANDBOX_BACKENDS).toContain(name);
    }
    for (const name of ["box-legacy", "namespace", "selfhost", "microsandbox", "fake"]) {
      expect(ZAP_SANDBOX_BACKENDS).toContain(name);
    }
  });

  it("still accepts the six-key factories object from 0.3.1 tests", () => {
    const backend = resolveSandboxBackend({ ZAP_SANDBOX_BACKEND: "docker" }, {
      auto: () => ({ name: "auto" }),
      box: () => ({ name: "box" }),
      daytona: () => ({ name: "daytona" }),
      docker: () => ({ name: "docker" }),
      e2b: () => ({ name: "e2b" }),
      vercel: () => ({ name: "vercel" }),
    });
    expect(backend.name).toBe("docker");
  });

  it("refuses the fake backend without ZAP_ALLOW_FAKE_SANDBOX=1", async () => {
    const backend = resolveSandboxBackend({ ZAP_SANDBOX_BACKEND: "fake" });
    expect(backend.name).toBe("fake");
    const error = await backend
      .create({ templateKey: null, sessionKey: "s-forbidden", runtimeContext })
      .catch((e: unknown) => e);
    const chain: string[] = [];
    for (let cur = error; cur instanceof Error; cur = cur.cause) chain.push(cur.message);
    expect(chain.join(" | ")).toMatch(/ZAP_ALLOW_FAKE_SANDBOX/);
  });

  it("create() acquires purpose runtime with sessionKey as idempotencyKey and shutdown releases", async () => {
    const service = fakeService();
    const backend = eveBackendFromProvider(service, "fake");
    expect(backend.name).toBe("fake");
    const handle = await backend.create({ templateKey: null, sessionKey: "session-1", runtimeContext });
    const state = await handle.captureState();
    expect(state.backendName).toBe("fake");
    expect(state.sessionKey).toBe("session-1");
    expect(typeof state.metadata.sandboxId).toBe("string");

    // parity: the Eve session drives the same v5 handle
    await handle.session.writeTextFile({ path: "hello.txt", content: "bridge" });
    const text = await handle.session.readTextFile({ path: "hello.txt" });
    expect(text).toBe("bridge");
    const run = await handle.session.run({ command: "pwd" });
    expect(run.exitCode).toBe(0);
    await handle.shutdown();
    await expect(handle.session.run({ command: "pwd" })).rejects.toMatchObject({ code: "SANDBOX_RELEASED" });
  });

  it("paths anchor at /workspace exactly like the 0.3.1 vendor session", async () => {
    const service = fakeService();
    const backend = eveBackendFromProvider(service, "fake");
    const handle = await backend.create({ templateKey: null, sessionKey: "session-2", runtimeContext });
    expect(handle.session.resolvePath("a/b.txt")).toBe("/workspace/a/b.txt");
    expect(handle.session.resolvePath("/etc/hosts")).toBe("/etc/hosts");
    await handle.shutdown();
  });

  it("routes box and docker ids through the bridge backend (lazy, no eager provider calls)", () => {
    const box = resolveSandboxBackend({ ZAP_SANDBOX_BACKEND: "box", BOX_API_KEY: "box_test_key" });
    expect(box.name).toBe("box");
    const docker = resolveSandboxBackend({ ZAP_SANDBOX_BACKEND: "docker" });
    expect(docker.name).toBe("docker");
    const legacy = resolveSandboxBackend({ ZAP_SANDBOX_BACKEND: "box-legacy", BOX_API_KEY: "box_test_key" });
    expect(legacy.name).toBe("ascii-box");
  });
});
