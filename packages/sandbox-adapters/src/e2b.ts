import type { SandboxBackend } from "eve/sandbox";
import type { Sandbox as E2BSandboxInstance } from "e2b";
import { createVendorBackend } from "./backend";
import {
  resolveE2BSandboxOptions,
  resolveSandboxResources,
  type SandboxResources,
} from "./resources";
import type { SandboxDriver } from "./session";

export async function e2bBackend(options: {
  apiKey?: string;
  resources?: SandboxResources;
} = {}): Promise<SandboxBackend> {
  const apiKey = options.apiKey ?? process.env.E2B_API_KEY;
  if (!apiKey) throw new Error("E2B_API_KEY is required when ZAP_SANDBOX_BACKEND=e2b.");
  const resources = options.resources ?? resolveSandboxResources();
  const resourceOptions = resolveE2BSandboxOptions(resources);
  const { Sandbox: E2BSandbox, Template } = await import("e2b");
  const baseTemplateName = templateName(`base-${resources.cpu}-${resources.memoryMb}`);
  let resourceBaseTemplate: Promise<string> | undefined;
  const ensureResourceBaseTemplate = () => resourceBaseTemplate ??= ensureE2BResourceBaseTemplate({
    async build() {
      await Template.build(Template().fromBaseImage(), baseTemplateName, {
        apiKey,
        ...resourceOptions.template,
      });
    },
    exists: () => Template.exists(baseTemplateName, { apiKey }),
    name: baseTemplateName,
  });

  return createVendorBackend({
    name: "e2b",
    templateName,
    async prewarmDriver(name) {
      const sandbox = await createSizedE2BSandbox(
        (template, createOptions) => E2BSandbox.create(template, createOptions),
        ensureResourceBaseTemplate,
        {
          apiKey,
          metadata: { runtime: "eve", template: name },
          ...resourceOptions.create,
        },
      );
      return e2bDriver(sandbox, async () => {
        try {
          const snapshot = await E2BSandbox.createSnapshot(sandbox.sandboxId, { apiKey });
          await Template.build(Template().fromTemplate(snapshot.snapshotId), name, {
            apiKey,
            ...resourceOptions.template,
          });
        } finally {
          await sandbox.kill();
        }
      });
    },
    async createDriver(input, snapshot) {
      const existing = typeof input.existingMetadata?.sandboxId === "string" ? input.existingMetadata.sandboxId : undefined;
      const sandbox = existing
        ? await E2BSandbox.connect(existing, { apiKey })
        : await E2BSandbox.create(snapshot ?? await ensureResourceBaseTemplate(), {
          apiKey,
          lifecycle: { onTimeout: { action: "pause", keepMemory: false } },
          metadata: input.tags,
          ...resourceOptions.create,
        });
      if (existing) await sandbox.setTimeout(resourceOptions.create.timeoutMs);
      return e2bDriver(sandbox, () => sandbox.pause({ keepMemory: false }).then(() => undefined));
    },
  });
}

export async function ensureE2BResourceBaseTemplate(input: {
  build: () => Promise<void>;
  exists: () => Promise<boolean>;
  name: string;
}) {
  if (!await input.exists()) await input.build();
  return input.name;
}

export async function createSizedE2BSandbox<T, O>(
  create: (template: string, options: O) => Promise<T>,
  ensureTemplate: () => Promise<string>,
  options: O,
) {
  return create(await ensureTemplate(), options);
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
      const { Sandbox: E2BSandbox } = await import("e2b");
      await E2BSandbox.updateNetwork(sandbox.sandboxId, { allowInternetAccess: policy === "allow-all" });
    },
    shutdown,
    async write(remotePath, content) { await sandbox.files.write(remotePath, Uint8Array.from(content).buffer); },
  };
}

function templateName(key: string) { return `zap-eve-${key.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 48)}`; }
function shellQuote(value: string) { return `'${value.replace(/'/g, `'"'"'`)}'`; }
