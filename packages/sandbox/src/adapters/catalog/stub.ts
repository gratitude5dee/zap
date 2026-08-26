import type { DoctorReport, SandboxCapabilities, SandboxProvider } from "../../contract.ts";

export class CatalogStubError extends Error {
  readonly code = "CATALOG_STUB";

  constructor(message: string) {
    super(message);
    this.name = "CatalogStubError";
  }
}

export interface CatalogManifest {
  id: `catalog:${string}`;
  name: string;
  /** repo-relative docs page; acquire() errors point here */
  docsUrl: string;
  vendorUrl: string;
  kind: "sandbox" | "gpu" | "inference" | "computer-use" | "document";
  verified: false;
  tier: "catalog";
  notes: string;
}

/** Placeholder row for a stub: nothing beyond the contract minimum is claimed. */
export const STUB_CAPABILITIES: SandboxCapabilities = {
  exec: true,
  files: true,
  readdir: false,
  detached: false,
  snapshot: false,
  fork: false,
  stop: false,
  resume: false,
  ports: false,
  privatePorts: false,
  desktop: false,
  ssh: false,
  networkPolicy: "none",
  gpu: false,
  kvm: false,
  docker: false,
  isolation: "none",
  sizes: [],
  maxCommandSeconds: 0,
};

export function createCatalogStub(manifest: CatalogManifest): SandboxProvider {
  const slug = manifest.id.slice("catalog:".length);
  return {
    id: manifest.id,
    async capabilities() {
      return manifest.kind === "gpu" || manifest.kind === "inference"
        ? { ...STUB_CAPABILITIES, gpu: true }
        : STUB_CAPABILITIES;
    },
    async acquire() {
      throw new CatalogStubError(
        `${manifest.name} is a catalog stub (verified:false) — no adapter is implemented yet; see ${manifest.docsUrl}`,
      );
    },
    async doctor(): Promise<DoctorReport> {
      return {
        provider: manifest.id,
        ok: false,
        checks: [
          {
            id: `catalog.${slug}.stub`,
            ok: false,
            required: false,
            detail: `catalog-stub — verified:false; kind:${manifest.kind}; acquire() throws CATALOG_STUB`,
            remediation: `see ${manifest.docsUrl}`,
          },
        ],
      };
    },
  };
}
