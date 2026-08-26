// Shared harness for the Z7 adapter matrix tests. Each provider fake wraps the
// in-memory fake handle so every adapter runs the same §5.3.1 contract steps
// without live credentials.
import path from "node:path";
import { expect } from "vitest";
import {
  createFakeHandle,
  type SandboxHandle,
  type SandboxProvider,
  type SandboxSpec,
} from "../../src/index.ts";

export const encoder = new TextEncoder();
export const decoder = new TextDecoder();

let counter = 0;

export interface MemoryVm {
  id: string;
  exec(
    command: string,
    opts?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  read(absPath: string): Promise<Uint8Array | null>;
  write(absPath: string, bytes: Uint8Array): Promise<void>;
  remove(absPath: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>;
  snapshot(): Promise<string>;
  restore(snapshotId: string): Promise<MemoryVm>;
  killed: boolean;
  kill(): Promise<void>;
}

/** In-memory vm shared by the adapter fakes; paths must be absolute. */
export function createMemoryVm(prefix: string): MemoryVm {
  counter += 1;
  const id = `${prefix}-${counter}-${Date.now().toString(36)}`;
  const handle: SandboxHandle = createFakeHandle({
    provider: "fake",
    purpose: "run",
    idempotencyKey: `memory-${id}`,
  });
  const forks = new Map<string, SandboxHandle>();
  const vm: MemoryVm = {
    id,
    killed: false,
    async exec(command, opts) {
      const result = await handle.exec(command, opts);
      return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
    },
    read: (absPath) => handle.fs.read(absPath),
    write: (absPath, bytes) => handle.fs.write(absPath, bytes),
    async remove(absPath, opts) {
      await handle.fs.remove(absPath, opts);
    },
    async snapshot() {
      if (!handle.fork) throw new Error("fake handle lost fork");
      const fork = await handle.fork({ idempotencyKey: `snap-${id}-${forks.size}`, purpose: "run" });
      const snapshotId = `snap-${id}-${forks.size}`;
      forks.set(snapshotId, fork);
      return snapshotId;
    },
    async restore(snapshotId) {
      const fork = forks.get(snapshotId);
      if (!fork) throw new Error(`unknown snapshot ${snapshotId}`);
      const restored = createMemoryVm(prefix);
      // copy-on-restore: reuse the forked handle directly
      restored.exec = (command, opts) =>
        fork.exec(command, opts).then((r) => ({ exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }));
      restored.read = (absPath) => fork.fs.read(absPath);
      restored.write = (absPath, bytes) => fork.fs.write(absPath, bytes);
      restored.remove = async (absPath, opts) => {
        await fork.fs.remove(absPath, opts);
      };
      return restored;
    },
    async kill() {
      vm.killed = true;
    },
  };
  return vm;
}

/**
 * The §5.3.1 conformance steps, mirrored from packages/sandbox/tests/contract.test.ts
 * (B-owned) so Session F adapters prove the same behavior fake-backed in CI.
 */
export async function runContractSteps(
  provider: SandboxProvider,
  workdir: string,
  specOverrides?: Partial<SandboxSpec>,
): Promise<void> {
  const spec: SandboxSpec = {
    provider: provider.id,
    purpose: "test",
    idempotencyKey: `contract-${provider.id}-${Date.now()}`,
    ...specOverrides,
  };
  const handle: SandboxHandle = await provider.acquire(spec);
  const capabilities = handle.capabilities;

  expect(handle.fs.resolve("fixture/input.txt")).toBe(path.posix.join(workdir, "fixture/input.txt"));

  expect((await handle.exec("mkdir -p fixture")).exitCode).toBe(0);
  await handle.fs.write("fixture/input.txt", encoder.encode("zap"));
  const transform = await handle.exec(
    `tr 'a-z' 'A-Z' < input.txt > output.txt && printf ':%s' "$CONTRACT_SUFFIX" >> output.txt`,
    { cwd: "fixture", env: { CONTRACT_SUFFIX: "ready" } },
  );
  expect(transform.exitCode).toBe(0);
  const output = await handle.fs.read("fixture/output.txt");
  expect(output && decoder.decode(output)).toBe("ZAP:ready");

  await handle.fs.remove("fixture", { recursive: true });
  expect(await handle.fs.read("fixture/output.txt")).toBeNull();

  expect((await handle.captureState()).provider).toBe(provider.id);

  let forked: SandboxHandle | undefined;
  if (capabilities.snapshot && capabilities.fork && handle.snapshot && handle.fork) {
    await handle.fs.write("persist.txt", encoder.encode("persisted"));
    await handle.snapshot(`contract-${Date.now()}`);
    forked = await handle.fork({ idempotencyKey: `${spec.idempotencyKey}-fork`, purpose: "test" });
    const persisted = await forked.fs.read("persist.txt");
    expect(persisted && decoder.decode(persisted)).toBe("persisted");
  }

  if (capabilities.stop && capabilities.resume && handle.stop && handle.resume) {
    await handle.fs.write("survives.txt", encoder.encode("still-here"));
    await handle.stop();
    expect(await handle.state()).toBe("stopped");
    await handle.resume();
    const survived = await handle.fs.read("survives.txt");
    expect(survived && decoder.decode(survived)).toBe("still-here");
  }

  if (capabilities.ports && capabilities.privatePorts && handle.host) {
    const hosted = await handle.host(8080, { private: true });
    expect(hosted.url).toMatch(/^https:\/\//);
    expect(hosted.isPrivate).toBe(true);
  }

  if (forked) await forked.release();
  await handle.release();
  await handle.release(); // twice is a no-op
  await expect(handle.exec("pwd")).rejects.toMatchObject({ code: "SANDBOX_RELEASED" });
}
