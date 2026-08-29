/**
 * Opt-in SAM mesh node (sam-node + the mesh-llm transport).
 *
 * Scoping is the whole design: a box joins the OWNER'S mesh — their own
 * control plane, their own nodes — using the owner's own bootstrap token. It
 * follows the tailnet pattern, not the loopback pattern, and it is explicitly
 * NOT a platform mesh (I1). Consequences enforced here:
 *
 *   - no default control-plane URL: no owner URL, no join;
 *   - the public SAM testnets (`*.sam-mesh.dev`) are rejected outright, since
 *     joining one would put this box on a mesh Zap does not own;
 *   - mesh-llm is joined by the owner's private invite token only —
 *     `--auto`/`--discover` (public community meshes) are never used;
 *   - the bootstrap token, mesh invite token, and local API token are
 *     registered for scrubbing and delivered as 0600 files that the unit's
 *     launcher reads, so no secret ever reaches argv, an event, or --json.
 */
import { randomBytes } from "node:crypto";
import { registerSecret, scrub } from "../auth/redact.ts";
import { ConnectivityCommandError, ConnectivityInputError, type ConnectivityBox, type SamMeshStatus } from "./types.ts";

const UNIT = "zap-sam-mesh.service";
const DIR = "/home/user/.zap/sam-mesh";
const STATUS_SCRIPT = `${DIR}/mesh-status.sh`;
const FORBIDDEN_HOST_SUFFIX = "sam-mesh.dev";
const TOKEN_RE = /^[\x21-\x7e]{8,512}$/;

export interface SamMeshEnableOptions {
  /** The owner's own SAM control plane (https). There is no default. */
  controlPlaneUrl: string;
  /** The owner's own enrollment bootstrap token. */
  bootstrapToken: string;
  /** Optional private mesh-llm invite token for the owner's own mesh. */
  meshInviteToken?: string;
}

export async function samMeshStatus(box: ConnectivityBox): Promise<SamMeshStatus> {
  const result = await box.exec(`bash ${STATUS_SCRIPT} 2>/dev/null || echo missing`, 60).catch(() => null);
  const out = result?.stdout.trim() ?? "";
  if (!result || out === "" || out === "missing") {
    const installed = await box.exec("command -v sam-node >/dev/null && echo installed || echo missing", 60).catch(() => null);
    return {
      controlPlaneUrl: null,
      enrolled: false,
      installed: installed !== null && installed.stdout.trim() === "installed",
      running: false,
    };
  }
  return parseStatus(out);
}

function parseStatus(out: string): SamMeshStatus {
  try {
    const parsed: unknown = JSON.parse(out);
    if (parsed === null || typeof parsed !== "object") {
      return { controlPlaneUrl: null, enrolled: false, installed: true, running: false };
    }
    const record = parsed as { installed?: unknown; running?: unknown; enrolled?: unknown; controlPlaneUrl?: unknown };
    return {
      controlPlaneUrl: typeof record.controlPlaneUrl === "string" && record.controlPlaneUrl.length > 0 ? record.controlPlaneUrl : null,
      enrolled: record.enrolled === true,
      installed: record.installed !== false,
      running: record.running === true,
    };
  } catch {
    return { controlPlaneUrl: null, enrolled: false, installed: true, running: false };
  }
}

/** Validates that the mesh is one the owner controls, and returns its URL. */
export function assertOwnerMesh(controlPlaneUrl: string): string {
  const raw = controlPlaneUrl.trim();
  if (raw === "") {
    throw new ConnectivityInputError("samMesh", "a SAM control-plane URL is required: the mesh you join must be your own");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConnectivityInputError("samMesh", "SAM control-plane URL is not a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new ConnectivityInputError("samMesh", "SAM control-plane URL must use https");
  }
  if (url.hostname === FORBIDDEN_HOST_SUFFIX || url.hostname.endsWith(`.${FORBIDDEN_HOST_SUFFIX}`)) {
    throw new ConnectivityInputError("samMesh", "public SAM testnets are not joinable from a Zap runtime: point this at your own control plane");
  }
  return url.toString().replace(/\/$/, "");
}

/**
 * Idempotent: re-enabling with the same owner config rewrites the same files
 * and re-runs `systemctl enable --now`, which is a no-op on a joined box.
 */
export async function enableSamMesh(box: ConnectivityBox, options: SamMeshEnableOptions): Promise<SamMeshStatus> {
  const controlPlaneUrl = assertOwnerMesh(options.controlPlaneUrl);
  const bootstrapToken = options.bootstrapToken.trim();
  if (!TOKEN_RE.test(bootstrapToken)) {
    throw new ConnectivityInputError("samMesh", "bootstrap token is missing or malformed (issue one from your own control plane)");
  }
  const meshInviteToken = options.meshInviteToken?.trim();
  if (meshInviteToken !== undefined && meshInviteToken !== "" && !TOKEN_RE.test(meshInviteToken)) {
    throw new ConnectivityInputError("samMesh", "mesh invite token is malformed");
  }

  registerSecret(bootstrapToken);
  if (meshInviteToken !== undefined && meshInviteToken !== "") registerSecret(meshInviteToken);
  const apiToken = randomBytes(32).toString("hex");
  registerSecret(apiToken);

  await box.exec(`mkdir -p ${DIR} && chmod 700 ${DIR}`, 60);
  await box.writeFile(".zap/sam-mesh/mesh.json", `${JSON.stringify({ controlPlaneUrl, meshInvite: meshInviteToken !== undefined && meshInviteToken !== "" }, null, 2)}\n`);
  await box.writeFile(".zap/sam-mesh/bootstrap-token", bootstrapToken);
  await box.writeFile(".zap/sam-mesh/api-token", apiToken);
  if (meshInviteToken !== undefined && meshInviteToken !== "") {
    await box.writeFile(".zap/sam-mesh/mesh-invite-token", meshInviteToken);
  }
  await box.exec(`chmod 600 ${DIR}/bootstrap-token ${DIR}/api-token ${DIR}/mesh.json 2>/dev/null || true`, 60);

  const result = await box.exec(`sudo systemctl enable --now ${UNIT}`, 240);
  if (result.exitCode !== 0) {
    throw new ConnectivityCommandError("samMesh", `sam mesh start failed: ${scrub(result.stderr).slice(0, 500)}`);
  }

  return samMeshStatus(box);
}

/** Idempotent: stops the node and removes the owner's enrollment material. */
export async function disableSamMesh(box: ConnectivityBox): Promise<void> {
  await box.exec(`sudo systemctl disable --now ${UNIT} 2>/dev/null || true`, 120).catch(() => undefined);
  await box
    .exec(`shred -u ${DIR}/bootstrap-token ${DIR}/api-token ${DIR}/mesh-invite-token 2>/dev/null || rm -f ${DIR}/bootstrap-token ${DIR}/api-token ${DIR}/mesh-invite-token; rm -f ${DIR}/mesh.json`, 120)
    .catch(() => undefined);
}
