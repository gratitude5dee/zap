import type {
  SandboxBackend,
  SandboxBackendCreateInput,
  SandboxBackendPrewarmInput,
  SandboxSeedFile,
} from "eve/sandbox";
import { buildVendorSandboxSession, type SandboxDriver } from "./session";

type VendorBackendOptions = {
  createDriver(input: SandboxBackendCreateInput, templateName?: string): Promise<SandboxDriver>;
  name: string;
  prewarmDriver?(templateName: string, input: SandboxBackendPrewarmInput): Promise<SandboxDriver>;
  templateName(templateKey: string): string;
};

export function createVendorBackend(options: VendorBackendOptions): SandboxBackend {
  const prepared = new Map<string, SandboxBackendPrewarmInput>();
  return {
    name: options.name,
    async prewarm(input) {
      if (prepared.has(input.templateKey)) return { reused: true };
      prepared.set(input.templateKey, input);
      if (!options.prewarmDriver) return { reused: false };
      const driver = await options.prewarmDriver(options.templateName(input.templateKey), input);
      try {
        await seedAndBootstrap(driver, input.seedFiles, input.bootstrap);
      } finally {
        await driver.shutdown();
      }
      return { reused: false };
    },
    async create(input) {
      const driver = await options.createDriver(input, input.templateKey ? options.templateName(input.templateKey) : undefined);
      const session = buildVendorSandboxSession(driver);
      const prewarmed = input.templateKey ? prepared.get(input.templateKey) : undefined;
      if (prewarmed && !options.prewarmDriver) {
        await seedAndBootstrap(driver, prewarmed.seedFiles, prewarmed.bootstrap);
      }
      return {
        async captureState() {
          return { backendName: options.name, metadata: { sandboxId: driver.id }, sessionKey: input.sessionKey };
        },
        session,
        shutdown: () => driver.shutdown(),
        useSessionFn: async () => session,
      };
    },
  };
}

async function seedAndBootstrap(
  driver: SandboxDriver,
  seedFiles: ReadonlyArray<SandboxSeedFile>,
  bootstrap?: SandboxBackendPrewarmInput["bootstrap"],
) {
  const session = buildVendorSandboxSession(driver);
  for (const seed of seedFiles) {
    await session.writeBinaryFile({
      content: typeof seed.content === "string" ? Buffer.from(seed.content) : seed.content,
      path: seed.path,
    });
  }
  if (bootstrap) await bootstrap({ use: async () => session });
}
