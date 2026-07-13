import type { SandboxBackend } from "eve/sandbox";
import { createVendorBackend } from "./backend";
import type { SandboxDriver } from "./session";

export async function e2bBackend(options: { apiKey?: string } = {}): Promise<SandboxBackend> {
  const apiKey = options.apiKey ?? process.env.E2B_API_KEY;
  if (!apiKey) throw new Error("E2B_API_KEY is required when ZAP_SANDBOX_BACKEND=e2b.");
  const { Sandbox: E2BSandbox } = await import("e2b") as unknown as E2BModule;
  return createVendorBackend({
    name: "e2b",
    templateName,
    async prewarmDriver(name) {
      const sandbox = await E2BSandbox.create({ apiKey, metadata: { runtime: "eve", template: name }, timeoutMs: 10 * 60_000 });
      return e2bDriver(sandbox, async () => {
        await E2BSandbox.createSnapshot(sandbox.sandboxId, { apiKey, name });
        await sandbox.kill();
      });
    },
    async createDriver(input, snapshot) {
      const existing = typeof input.existingMetadata?.sandboxId === "string" ? input.existingMetadata.sandboxId : undefined;
      const sandbox = existing
        ? await E2BSandbox.connect(existing, { apiKey })
        : snapshot
          ? await E2BSandbox.create(snapshot, { apiKey, lifecycle: { onTimeout: { action: "pause", keepMemory: false } }, metadata: input.tags, timeoutMs: 10 * 60_000 })
          : await E2BSandbox.create({ apiKey, lifecycle: { onTimeout: { action: "pause", keepMemory: false } }, metadata: input.tags, timeoutMs: 10 * 60_000 });
      return e2bDriver(sandbox, () => sandbox.pause({ keepMemory: false }).then(() => undefined));
    },
  });
}

function e2bDriver(sandbox: E2BSandboxInstance, shutdown: () => Promise<void>): SandboxDriver {
  return {
    id: sandbox.sandboxId,
    async read(remotePath) {
      try { return await sandbox.files.read(remotePath, { format: "bytes" }); } catch { return null; }
    },
    async remove(remotePath, recursive, force) {
      await sandbox.commands.run(`rm ${recursive ? "-r " : ""}${force ? "-f " : ""}-- ${shellQuote(remotePath)}`);
    },
    async run(input) {
      try {
        const result = await sandbox.commands.run(input.command, {
          cwd: input.workingDirectory,
          envs: input.env,
          signal: input.abortSignal,
        });
        return { exitCode: result.exitCode, stderr: result.stderr, stdout: result.stdout };
      } catch (error) {
        const result = error as { exitCode?: number; stderr?: string; stdout?: string };
        return { exitCode: result.exitCode ?? 1, stderr: result.stderr ?? String(error), stdout: result.stdout ?? "" };
      }
    },
    async setNetworkPolicy(policy) {
      if (policy !== "allow-all" && policy !== "deny-all") throw new Error("E2B adapter currently supports allow-all or deny-all network policy only.");
      const { Sandbox: E2BSandbox } = await import("e2b") as unknown as E2BModule;
      await E2BSandbox.updateNetwork(sandbox.sandboxId, { allowInternetAccess: policy === "allow-all" });
    },
    shutdown,
    async write(remotePath, content) { await sandbox.files.write(remotePath, Uint8Array.from(content).buffer); },
  };
}

function templateName(key: string) { return `zap-eve-${key.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 48)}`; }
function shellQuote(value: string) { return `'${value.replace(/'/g, `'"'"'`)}'`; }

interface E2BModule {
  Sandbox: {
    connect(id: string, options: { apiKey: string }): Promise<E2BSandboxInstance>;
    create(templateOrOptions: string | Record<string, unknown>, options?: Record<string, unknown>): Promise<E2BSandboxInstance>;
    createSnapshot(id: string, options: { apiKey: string; name: string }): Promise<unknown>;
    updateNetwork(id: string, options: { allowInternetAccess: boolean }): Promise<unknown>;
  };
}

interface E2BSandboxInstance {
  sandboxId: string;
  commands: {
    run(command: string, options?: {
      cwd?: string;
      envs?: Record<string, string>;
      signal?: AbortSignal;
    }): Promise<{ exitCode: number; stderr: string; stdout: string }>;
  };
  files: {
    read(path: string, options: { format: "bytes" }): Promise<Uint8Array>;
    write(path: string, content: ArrayBuffer): Promise<unknown>;
  };
  kill(): Promise<void>;
  pause(options: { keepMemory: boolean }): Promise<unknown>;
}
