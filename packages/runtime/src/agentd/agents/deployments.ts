// Immutable deployments (§5.12): /zap/deployments/<bundleSha>/{bundle.mjs,
// manifest.json,skills/}. Registering an existing sha is a no-op.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { DeploymentManifest } from "@wzrdtech/zap-agent";

export interface DeploymentRecord {
  id: string;
  dir: string;
  manifest: DeploymentManifest;
}

export interface RegisterDeploymentInput {
  manifest: DeploymentManifest;
  bundle?: Uint8Array | string;
  skills?: Record<string, Uint8Array | string>;
}

export interface DeploymentStore {
  register(input: RegisterDeploymentInput): Promise<DeploymentRecord>;
  get(id: string): Promise<DeploymentRecord | null>;
  list(): Promise<string[]>;
}

export function createDeploymentStore(root: string): DeploymentStore {
  const base = path.join(root, "deployments");

  async function read(id: string): Promise<DeploymentRecord | null> {
    const dir = path.join(base, id);
    const raw = await fs.readFile(path.join(dir, "manifest.json"), "utf8").catch(() => null);
    if (raw === null) return null;
    return { id, dir, manifest: JSON.parse(raw) as DeploymentManifest };
  }

  return {
    async register(input) {
      const id = input.manifest.bundleSha;
      const existing = await read(id);
      if (existing) return existing;
      const dir = path.join(base, id);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(input.manifest, null, 2));
      if (input.bundle !== undefined) {
        await fs.writeFile(path.join(dir, "bundle.mjs"), input.bundle);
      }
      for (const [rel, contents] of Object.entries(input.skills ?? {})) {
        const target = path.join(dir, "skills", rel);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, contents);
      }
      return { id, dir, manifest: input.manifest };
    },
    get: read,
    async list() {
      const entries = await fs.readdir(base).catch(() => []);
      return entries.sort();
    },
  };
}
