import type { MemoryService } from "./contract.ts";
import { MemoryError } from "./errors.ts";

export interface ControlPlaneMemoryOptions {
  /** I6 export from the managed control API requires consent recorded on the runtime row. */
  exportConsent?: boolean;
}

function offVm(method: string): never {
  throw new MemoryError(
    "MEMORY_CONTENT_OFF_VM",
    `${method} is a content method: memory content lives on the VM and is only reachable in-VM or from the self-host CLI`,
  );
}

/**
 * Off-VM guard for the managed control plane (packages/cloud): content
 * methods throw MEMORY_CONTENT_OFF_VM; status/forget/wipeSession pass
 * through; export requires explicit consent.
 */
export function createControlPlaneMemory(
  inner: MemoryService,
  options: ControlPlaneMemoryOptions = {},
): MemoryService {
  return {
    provider: inner.provider,
    locality: inner.locality,

    async status() {
      return inner.status();
    },
    async remember() {
      return offVm("remember");
    },
    async addResource() {
      return offVm("addResource");
    },
    async search() {
      return offVm("search");
    },
    async read() {
      return offVm("read");
    },
    async forget(scope, uri) {
      return inner.forget(scope, uri);
    },
    async wipeSession(scope) {
      return inner.wipeSession(scope);
    },
    async export(scope) {
      if (options.exportConsent !== true) {
        throw new MemoryError(
          "MEMORY_CONSENT_REQUIRED",
          "export from the managed control plane requires consent recorded on the runtime row (zap memory export --consent)",
        );
      }
      return inner.export(scope);
    },
  };
}
