import { describe, expect, it } from "vitest";
import {
  createDaytonaProvider,
  DAYTONA_CAPABILITIES,
  DAYTONA_WORKDIR,
  type DaytonaSandboxLike,
} from "../../src/adapters/daytona/index.ts";
import { createMemoryVm, runContractSteps } from "./support.ts";

function fakeDaytona() {
  const logBuffer: string[] = [];
  const make = (): DaytonaSandboxLike => {
    const backing = createMemoryVm("daytona");
    let stopped = false;
    return {
      id: backing.id,
      runCommand: (command, opts) => backing.exec(command, opts),
      readFile: (p) => backing.read(p),
      writeFile: (p, bytes) => backing.write(p, bytes),
      removePath: (p, opts) => backing.remove(p, opts),
      snapshot: async (name) => ({ id: `daytona-snap-${name}` }),
      stop: async () => {
        stopped = true;
      },
      start: async () => {
        stopped = false;
      },
      isStopped: () => stopped,
      getPreviewLink: async (port) => ({
        url: `https://${port}-${backing.id}.daytona.invalid`,
        token: `preview-token-${backing.id}`,
      }),
      delete: () => backing.kill(),
    };
  };
  return { createSandbox: async () => make(), logBuffer };
}

describe("daytona adapter", () => {
  it("passes the contract steps fake-backed", async () => {
    const backend = fakeDaytona();
    const provider = createDaytonaProvider({
      createSandbox: backend.createSandbox,
      log: (line) => backend.logBuffer.push(line),
    });
    await runContractSteps(provider, DAYTONA_WORKDIR);
    // C24: preview tokens never reach the log buffer
    expect(backend.logBuffer.join("\n")).not.toContain("preview-token-");
  });

  it("reports container isolation with stop/resume and private preview ports", () => {
    expect(DAYTONA_CAPABILITIES.isolation).toBe("container");
    expect(DAYTONA_CAPABILITIES.stop).toBe(true);
    expect(DAYTONA_CAPABILITIES.resume).toBe(true);
    expect(DAYTONA_CAPABILITIES.ports).toBe(true);
    expect(DAYTONA_CAPABILITIES.privatePorts).toBe(true);
    expect(DAYTONA_CAPABILITIES.gpu).toBe(false);
  });

  it("doctor fails without a key or factory and marks first-party tier", async () => {
    const unwired = createDaytonaProvider({});
    const report = await unwired.doctor();
    expect(report.ok).toBe(false);
    expect(report.checks.some((c) => c.detail?.includes("first-party"))).toBe(true);
    expect((await createDaytonaProvider({ apiKey: "dtn_test" }).doctor()).ok).toBe(true);
  });

  it("acquire without SDK or factory throws SDK_REQUIRED", async () => {
    const provider = createDaytonaProvider({ apiKey: "dtn_test" });
    await expect(
      provider.acquire({ provider: "daytona", purpose: "test", idempotencyKey: "k" }),
    ).rejects.toMatchObject({ code: "SDK_REQUIRED" });
  });
});
