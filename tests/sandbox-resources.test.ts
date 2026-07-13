import { describe, expect, it, vi } from "vitest";
import { enforceDaytonaResources } from "../packages/sandbox-adapters/src/daytona";
import {
  createSizedE2BSandbox,
  ensureE2BResourceBaseTemplate,
} from "../packages/sandbox-adapters/src/e2b";
import {
  resolveBoxSandboxOptions,
  resolveDaytonaSandboxOptions,
  resolveE2BSandboxOptions,
  resolveSandboxResources,
  resolveVercelSandboxOptions,
} from "../packages/sandbox-adapters/src/resources";

describe("sandbox preset resources", () => {
  it("uses the canonical standard preset when explicit deployment values are absent", () => {
    expect(resolveSandboxResources({})).toEqual({
      cpu: 2,
      memoryMb: 4096,
      timeoutSeconds: 900,
    });
  });

  it("parses the canonical deployment environment", () => {
    expect(resolveSandboxResources({
      ZAP_SANDBOX_CPU: "4",
      ZAP_SANDBOX_MEMORY_MB: "8192",
      ZAP_SANDBOX_TIMEOUT_SECONDS: "1200",
    })).toEqual({ cpu: 4, memoryMb: 8192, timeoutSeconds: 1200 });
  });

  it.each([
    ["ZAP_SANDBOX_CPU", "0"],
    ["ZAP_SANDBOX_CPU", "1.5"],
    ["ZAP_SANDBOX_MEMORY_MB", "many"],
    ["ZAP_SANDBOX_TIMEOUT_SECONDS", "-1"],
  ])("rejects invalid %s values", (key, value) => {
    expect(() => resolveSandboxResources({ [key]: value })).toThrow(key);
  });

  it("maps the preset to Vercel's supported create fields", () => {
    expect(resolveVercelSandboxOptions({ cpu: 2, memoryMb: 4096, timeoutSeconds: 900 })).toEqual({
      resources: { vcpus: 2 },
      timeout: 900_000,
    });
  });

  it("maps the preset timeout to Box's supported auto-archive TTL", () => {
    expect(resolveBoxSandboxOptions({ cpu: 2, memoryMb: 4096, timeoutSeconds: 900 }))
      .toEqual({ ttlSeconds: 900 });
  });

  it("rejects memory shapes that Vercel cannot represent independently", () => {
    expect(() => resolveVercelSandboxOptions({ cpu: 2, memoryMb: 8192, timeoutSeconds: 900 }))
      .toThrow(/2048 MB per vCPU/i);
  });

  it("maps Daytona memory to GiB and timeout to its integer idle interval", () => {
    expect(resolveDaytonaSandboxOptions({ cpu: 2, memoryMb: 4096, timeoutSeconds: 900 })).toEqual({
      autoStopInterval: 15,
      resources: { cpu: 2, memory: 4 },
    });
  });

  it("rejects Daytona memory values that cannot be expressed as whole GiB", () => {
    expect(() => resolveDaytonaSandboxOptions({ cpu: 2, memoryMb: 1536, timeoutSeconds: 900 }))
      .toThrow(/whole GiB/i);
  });

  it("maps E2B sizing to template build and timeout to runtime creation", () => {
    expect(resolveE2BSandboxOptions({ cpu: 2, memoryMb: 4096, timeoutSeconds: 900 })).toEqual({
      create: { timeoutMs: 900_000 },
      template: { cpuCount: 2, memoryMB: 4096 },
    });
  });

  it("reuses an existing sized E2B base template", async () => {
    const build = vi.fn(async () => undefined);
    await expect(ensureE2BResourceBaseTemplate({
      build,
      exists: vi.fn(async () => true),
      name: "zap-eve-base-2-4096",
    })).resolves.toBe("zap-eve-base-2-4096");
    expect(build).not.toHaveBeenCalled();
  });

  it("builds the sized E2B base template only when it is absent", async () => {
    const build = vi.fn(async () => undefined);
    await ensureE2BResourceBaseTemplate({
      build,
      exists: vi.fn(async () => false),
      name: "zap-eve-base-2-4096",
    });
    expect(build).toHaveBeenCalledOnce();
  });

  it("starts E2B prewarm work from the sized base template", async () => {
    const create = vi.fn(async () => ({ sandboxId: "sbx-prewarm" }));
    const ensureTemplate = vi.fn(async () => "zap-eve-base-2-4096");
    await expect(createSizedE2BSandbox(create, ensureTemplate, {
      apiKey: "test-key",
      timeoutMs: 900_000,
    })).resolves.toEqual({ sandboxId: "sbx-prewarm" });
    expect(ensureTemplate).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith("zap-eve-base-2-4096", {
      apiKey: "test-key",
      timeoutMs: 900_000,
    });
  });

  it("hot-resizes a Daytona sandbox when the preset only increases resources", async () => {
    const sandbox = daytonaSandbox({ cpu: 1, memory: 2 });
    await enforceDaytonaResources(sandbox, { cpu: 2, memory: 4 });
    expect(sandbox.resize).toHaveBeenCalledWith({ cpu: 2, memory: 4 });
    expect(sandbox.stop).not.toHaveBeenCalled();
    expect(sandbox.start).not.toHaveBeenCalled();
  });

  it("stops a Daytona sandbox before a resource decrease", async () => {
    const sandbox = daytonaSandbox({ cpu: 4, memory: 8 });
    await enforceDaytonaResources(sandbox, { cpu: 2, memory: 4 });
    expect(sandbox.stop).toHaveBeenCalledOnce();
    expect(sandbox.resize).toHaveBeenCalledWith({ cpu: 2, memory: 4 });
    expect(sandbox.start).toHaveBeenCalledOnce();
  });
});

function daytonaSandbox(resources: { cpu: number; memory: number }) {
  return {
    ...resources,
    resize: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  };
}
