/**
 * Opt-in connectivity control plane: status/enable/disable for the four
 * default-off features every runtime template ships installed-but-disabled.
 */
import type { BoxClient, SandboxHandle } from "@wzrdtech/zap-sandbox";
import { cotalStatus, disableCotal, enableCotal } from "./cotal.ts";
import { disableSamMesh, enableSamMesh, samMeshStatus } from "./sam-mesh.ts";
import { disableTailscale, enableTailscale, tailscaleStatus } from "./tailscale.ts";
import { disableTaskrouter, enableTaskrouter, taskrouterStatus } from "./taskrouter.ts";
import type { ConnectivityBox, ConnectivityStatus } from "./types.ts";

export { cotalStatus, disableCotal, enableCotal } from "./cotal.ts";
export { assertOwnerMesh, disableSamMesh, enableSamMesh, samMeshStatus, type SamMeshEnableOptions } from "./sam-mesh.ts";
export { disableTailscale, enableTailscale, tailscaleStatus, type TailscaleEnableOptions } from "./tailscale.ts";
export { disableTaskrouter, enableTaskrouter, taskrouterStatus } from "./taskrouter.ts";
export {
  CONNECTIVITY_FEATURES,
  ConnectivityCommandError,
  ConnectivityInputError,
  defaultConnectivity,
  type ConnectivityBox,
  type ConnectivityCommandResult,
  type ConnectivityFeature,
  type ConnectivityFlags,
  type ConnectivityStatus,
  type CotalStatus,
  type SamMeshStatus,
  type TailscaleStatus,
  type TaskrouterStatus,
} from "./types.ts";

/** Binds a Box adapter client to one box, so control logic never speaks HTTP. */
export function boxConnectivity(client: BoxClient, boxId: string): ConnectivityBox {
  return {
    exec: (command: string, timeoutSeconds?: number) => client.exec(boxId, command, timeoutSeconds),
    writeFile: (path: string, content: string) => client.writeFile(boxId, path, content),
  };
}

/** Binds any sandbox handle (Box, Modal, local, fake) to the same control surface. */
export function handleConnectivity(handle: SandboxHandle): ConnectivityBox {
  return {
    async exec(command: string) {
      const result = await handle.exec(command);
      return { exitCode: result.exitCode, stderr: result.stderr, stdout: result.stdout };
    },
    async writeFile(path: string, content: string) {
      await handle.fs.write(handle.fs.resolve(path), new TextEncoder().encode(content));
    },
  };
}

export async function connectivityStatus(box: ConnectivityBox): Promise<ConnectivityStatus> {
  const [tailscale, cotal, taskrouter, samMesh] = await Promise.all([
    tailscaleStatus(box),
    cotalStatus(box),
    taskrouterStatus(box),
    samMeshStatus(box),
  ]);
  return { cotal, samMesh, tailscale, taskrouter };
}

export const connectivityControls = {
  cotal: { disable: disableCotal, enable: enableCotal, status: cotalStatus },
  samMesh: { disable: disableSamMesh, enable: enableSamMesh, status: samMeshStatus },
  tailscale: { disable: disableTailscale, enable: enableTailscale, status: tailscaleStatus },
  taskrouter: { disable: disableTaskrouter, enable: enableTaskrouter, status: taskrouterStatus },
} as const;
