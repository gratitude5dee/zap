import { describe, expect, it } from "vitest";
import {
  createE2BProvider,
  E2B_CAPABILITIES,
  E2B_WORKDIR,
  type E2BSandboxLike,
} from "../../src/adapters/e2b/index.ts";
import { createMemoryVm, runContractSteps } from "./support.ts";

function fakeE2B() {
  const vms = new Map<string, ReturnType<typeof createMemoryVm>>();
  const make = (id?: string): E2BSandboxLike => {
    const vm = id ? vms.get(id) : undefined;
    const backing = vm ?? createMemoryVm("e2b");
    vms.set(backing.id, backing);
    return {
      id: backing.id,
      runCommand: (command, opts) => backing.exec(command, opts),
      readFile: (p) => backing.read(p),
      writeFile: (p, bytes) => backing.write(p, bytes),
      removePath: (p, opts) => backing.remove(p, opts),
      pause: async () => backing.id,
      kill: () => backing.kill(),
      getHost: async (port) => `https://${port}-${backing.id}.e2b.invalid`,
    };
  };
  return {
    createSandbox: async () => make(),
    connectSandbox: async (id: string) => make(id),
    vms,
  };
}

describe("e2b adapter", () => {
  it("passes the contract steps fake-backed", async () => {
    const backend = fakeE2B();
    const provider = createE2BProvider({
      createSandbox: backend.createSandbox,
      connectSandbox: backend.connectSandbox,
    });
    await runContractSteps(provider, E2B_WORKDIR);
  });

  it("reports microvm isolation without gpu", async () => {
    expect(E2B_CAPABILITIES.isolation).toBe("microvm");
    expect(E2B_CAPABILITIES.gpu).toBe(false);
    expect(E2B_CAPABILITIES.snapshot).toBe(true);
    expect(E2B_CAPABILITIES.resume).toBe(true);
  });

  it("doctor reports first-party tier and fails without a key or factory", async () => {
    const unwired = createE2BProvider({});
    const report = await unwired.doctor();
    expect(report.ok).toBe(false);
    expect(report.checks.some((c) => c.detail?.includes("first-party"))).toBe(true);

    const wired = createE2BProvider({ apiKey: "e2b_test" });
    expect((await wired.doctor()).ok).toBe(true);
  });

  it("acquire without SDK or factory throws SDK_REQUIRED", async () => {
    const provider = createE2BProvider({ apiKey: "e2b_test" });
    await expect(
      provider.acquire({ provider: "e2b", purpose: "test", idempotencyKey: "k" }),
    ).rejects.toMatchObject({ code: "SDK_REQUIRED" });
  });
});
