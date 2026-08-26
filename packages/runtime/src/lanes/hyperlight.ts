import { access } from "node:fs/promises";

/**
 * The `wasm` lane's Hyperlight isolation. Hyperlight runs WASM guest
 * functions in a micro-VM without a kernel or OS boot: no processes, no
 * filesystem of its own — file access happens through host callbacks the
 * embedding registers explicitly (`files: host callbacks`). It does not run
 * arbitrary Linux binaries; only wasm32 guests compiled against the
 * Hyperlight guest API. Requires /dev/kvm on the host.
 */
export const HYPERLIGHT_WASM_NOTES = {
  isolation: "hyperlight-wasm" as const,
  files: "host callbacks" as const,
  requires: ["/dev/kvm", "hyperlight-wasm host binary"] as const,
};

export async function hyperlightWasmAvailable(hostBinary = "hyperlight-wasm"): Promise<boolean> {
  try {
    await access("/dev/kvm");
  } catch {
    return false;
  }
  const paths = (process.env.PATH ?? "").split(":");
  for (const dir of paths) {
    try {
      await access(`${dir}/${hostBinary}`);
      return true;
    } catch {
      // keep looking
    }
  }
  return false;
}
