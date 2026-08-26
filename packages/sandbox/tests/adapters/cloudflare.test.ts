import { describe, expect, it } from "vitest";
import {
  CLOUDFLARE_CAPABILITIES,
  CLOUDFLARE_WORKDIR,
  createCloudflareProvider,
  type CloudflareSandboxLike,
} from "../../src/adapters/cloudflare/index.ts";
import { createMemoryVm, runContractSteps } from "./support.ts";

function fakeCloudflare() {
  const make = (): CloudflareSandboxLike => {
    const backing = createMemoryVm("cf");
    return {
      id: backing.id,
      exec: (command, opts) => backing.exec(command, opts),
      readFile: (p) => backing.read(p),
      writeFile: (p, bytes) => backing.write(p, bytes),
      removePath: (p, opts) => backing.remove(p, opts),
      exposePort: async (port) => ({ url: `https://${port}-${backing.id}.cf.invalid` }),
      createBackup: async () => ({ id: `cf-backup-${backing.id}` }),
      destroy: () => backing.kill(),
    };
  };
  return { getSandbox: async () => make() };
}

describe("cloudflare adapter", () => {
  it("passes the contract steps fake-backed", async () => {
    const provider = createCloudflareProvider({ getSandbox: fakeCloudflare().getSandbox });
    await runContractSteps(provider, CLOUDFLARE_WORKDIR);
  });

  it("uses createBackup as the snapshot primitive", async () => {
    const provider = createCloudflareProvider({ getSandbox: fakeCloudflare().getSandbox });
    const handle = await provider.acquire({
      provider: "cloudflare",
      purpose: "test",
      idempotencyKey: "cf-snap",
    });
    if (!handle.snapshot) throw new Error("cloudflare handle must expose snapshot");
    const ref = await handle.snapshot("backup-1");
    expect(ref.provider).toBe("cloudflare");
    expect(ref.id).toMatch(/^cf-backup-/);
    await handle.release();
  });

  it("reports container isolation with public ports only", () => {
    expect(CLOUDFLARE_CAPABILITIES.isolation).toBe("container");
    expect(CLOUDFLARE_CAPABILITIES.ports).toBe(true);
    expect(CLOUDFLARE_CAPABILITIES.privatePorts).toBe(false);
    expect(CLOUDFLARE_CAPABILITIES.snapshot).toBe(true);
    expect(CLOUDFLARE_CAPABILITIES.gpu).toBe(false);
  });

  it("doctor fails without binding or factory and marks first-party tier", async () => {
    const unwired = createCloudflareProvider({});
    const report = await unwired.doctor();
    expect(report.ok).toBe(false);
    expect(report.checks.some((c) => c.detail?.includes("first-party"))).toBe(true);
  });
});
