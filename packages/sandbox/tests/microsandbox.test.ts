// Microsandbox adapter (injected msb factory) — §13 session B / Z4.
import { describe, expect, it } from "vitest";
import { createMicrosandboxProvider, type MsbSandboxLike } from "../src/index.ts";

function makeMsb(): { sandbox: MsbSandboxLike; calls: string[] } {
  const calls: string[] = [];
  const files = new Map<string, string>();
  const sandbox: MsbSandboxLike = {
    id: "msb-1",
    async exec(command) {
      calls.push(`exec:${command}`);
      return { exitCode: 0, stdout: "ok", stderr: "" };
    },
    async snapshot(name) {
      calls.push(`snapshot:${name}`);
      return { id: `snap-${name}` };
    },
    async stop() {
      calls.push("stop");
    },
    async readFile(path) {
      return files.get(path) ?? null;
    },
    async writeFile(path, content) {
      files.set(path, content);
    },
    async removePath(path) {
      files.delete(path);
    },
  };
  return { sandbox, calls };
}

describe("microsandbox adapter", () => {
  it("requires the msb SDK or an injected factory", async () => {
    const provider = createMicrosandboxProvider({});
    await expect(
      provider.acquire({ provider: "microsandbox", purpose: "test", idempotencyKey: "m-1" }),
    ).rejects.toMatchObject({ code: "SDK_REQUIRED" });
  });

  it("execs, snapshots, and stops the microVM on release (purpose test)", async () => {
    const { sandbox, calls } = makeMsb();
    const provider = createMicrosandboxProvider({ createSandbox: async () => sandbox });
    const handle = await provider.acquire({ provider: "microsandbox", purpose: "test", idempotencyKey: "m-2" });
    expect((await handle.exec("echo hi")).exitCode).toBe(0);
    const snap = await handle.snapshot!("keep");
    expect(snap.id).toBe("snap-keep");
    await handle.release();
    expect(calls).toContain("stop");
    await expect(handle.exec("echo hi")).rejects.toMatchObject({ code: "SANDBOX_RELEASED" });
  });

  it("keeps the microVM running for purpose lane (parent owns it)", async () => {
    const { sandbox, calls } = makeMsb();
    const provider = createMicrosandboxProvider({ createSandbox: async () => sandbox });
    const handle = await provider.acquire({ provider: "microsandbox", purpose: "lane", idempotencyKey: "m-3" });
    await handle.release();
    expect(calls).not.toContain("stop");
  });
});
