/**
 * Opt-in connectivity: shared types for the four box-local features a runtime
 * can turn on (all default-off, all installed-but-disabled at bake).
 *
 * The control surface is deliberately tiny — status/enable/disable over the
 * Box command API — so the security argument is auditable in one file per
 * feature: credentials arrive as one-shot 0600 files, never as argv, and the
 * only networks a box may join are the owner's own.
 */

export const CONNECTIVITY_FEATURES = ["tailscale", "cotal", "taskrouter", "samMesh"] as const;

export type ConnectivityFeature = (typeof CONNECTIVITY_FEATURES)[number];

export type ConnectivityFlags = Record<ConnectivityFeature, boolean>;

/** Every feature is off until an owner says otherwise. */
export function defaultConnectivity(): ConnectivityFlags {
  return { cotal: false, samMesh: false, tailscale: false, taskrouter: false };
}

export interface ConnectivityCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * The slice of the Box adapter these modules need. Callers bind a concrete
 * box with `boxConnectivity(client, boxId)` so control logic never talks to a
 * provider HTTP surface directly.
 */
export interface ConnectivityBox {
  exec(command: string, timeoutSeconds?: number): Promise<ConnectivityCommandResult>;
  writeFile(path: string, content: string): Promise<void>;
}

/** Bad owner input (malformed key, missing/forbidden control plane). Never carries the credential. */
export class ConnectivityInputError extends Error {
  readonly feature: ConnectivityFeature;

  constructor(feature: ConnectivityFeature, message: string) {
    super(message);
    this.name = "ConnectivityInputError";
    this.feature = feature;
  }
}

/** A command on the box failed. Message is scrubbed before it reaches here. */
export class ConnectivityCommandError extends Error {
  readonly feature: ConnectivityFeature;

  constructor(feature: ConnectivityFeature, message: string) {
    super(message);
    this.name = "ConnectivityCommandError";
    this.feature = feature;
  }
}

export interface TailscaleStatus {
  installed: boolean;
  running: boolean;
  dnsName: string | null;
}

export interface CotalStatus {
  installed: boolean;
  running: boolean;
}

export interface TaskrouterStatus {
  installed: boolean;
  running: boolean;
  modelPresent: boolean;
  mode: "model" | "heuristic";
}

export interface SamMeshStatus {
  installed: boolean;
  running: boolean;
  enrolled: boolean;
  /** The owner's own control plane, or null when the box has joined nothing. */
  controlPlaneUrl: string | null;
}

export interface ConnectivityStatus {
  tailscale: TailscaleStatus;
  cotal: CotalStatus;
  taskrouter: TaskrouterStatus;
  samMesh: SamMeshStatus;
}
