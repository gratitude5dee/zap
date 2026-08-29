/**
 * Opt-in tailnet control (ported from airv2 `lib/box/tailscale.ts`).
 *
 * The box joins the OWNER'S tailnet with the OWNER'S auth key: Zap holds no
 * tailnet, mints no key, and keeps no copy. The key is registered for scrubbing
 * (C24), handed over as a one-shot 0600 file that is shredded in `finally`, and
 * never appears in a command string, an error, or a status payload.
 */
import { randomBytes } from "node:crypto";
import { registerSecret, scrub } from "../auth/redact.ts";
import { ConnectivityCommandError, ConnectivityInputError, type ConnectivityBox, type TailscaleStatus } from "./types.ts";

const AUTH_KEY_RE = /^tskey-[\x21-\x7e]{8,256}$/;
const SOCKET = "/home/user/.tailscale/tailscaled.sock";
const UNIT = "zap-tailscaled.service";

export interface TailscaleEnableOptions {
  /** The owner's own Tailscale auth key (`tskey-…`), from their admin console. */
  authKey: string;
  hostname?: string;
}

export async function tailscaleStatus(box: ConnectivityBox): Promise<TailscaleStatus> {
  const result = await box
    .exec(`command -v tailscale >/dev/null || { echo missing; exit 0; }; tailscale --socket=${SOCKET} status --json 2>/dev/null || echo down`, 60)
    .catch(() => null);
  const out = result?.stdout.trim() ?? "";
  if (!result || out === "" || out === "missing") return { dnsName: null, installed: false, running: false };
  if (out === "down") return { dnsName: null, installed: true, running: false };
  return parseStatusJson(out);
}

function parseStatusJson(out: string): TailscaleStatus {
  try {
    const parsed: unknown = JSON.parse(out);
    if (parsed === null || typeof parsed !== "object") return { dnsName: null, installed: true, running: false };
    const record = parsed as { BackendState?: unknown; Self?: unknown };
    const running = record.BackendState === "Running";
    const self = record.Self;
    const dns = self !== null && typeof self === "object" ? (self as { DNSName?: unknown }).DNSName : undefined;
    const dnsName = typeof dns === "string" && dns.length > 0 ? dns.replace(/\.$/, "") : null;
    return { dnsName, installed: true, running };
  } catch {
    return { dnsName: null, installed: true, running: false };
  }
}

/**
 * Idempotent: re-running against an already-joined box re-applies the same
 * `tailscale up` and returns the same status.
 */
export async function enableTailscale(box: ConnectivityBox, options: TailscaleEnableOptions): Promise<TailscaleStatus> {
  const authKey = options.authKey.trim();
  if (!AUTH_KEY_RE.test(authKey)) {
    throw new ConnectivityInputError("tailscale", "auth key must start with tskey- (create one in your own Tailscale admin console)");
  }
  registerSecret(authKey);

  const nonce = randomBytes(8).toString("hex");
  const relative = `.tailscale/authkey-${nonce}`;
  const absolute = `/home/user/${relative}`;
  const hostname = sanitizeHostname(options.hostname ?? "zap-box");

  try {
    await box.exec("mkdir -p /home/user/.tailscale && chmod 700 /home/user/.tailscale", 60);
    await box.writeFile(relative, authKey);
    await box.exec(`chmod 600 ${absolute}`, 60);
    const result = await box.exec(
      `sudo systemctl enable --now ${UNIT} && sleep 2 && tailscale --socket=${SOCKET} up --auth-key=file:${absolute} --hostname=${hostname} --accept-dns=false --accept-routes=false --ssh=false --timeout=60s`,
      180,
    );
    if (result.exitCode !== 0) {
      throw new ConnectivityCommandError("tailscale", `tailscale up failed: ${scrub(result.stderr).slice(0, 500)}`);
    }
  } finally {
    await box.exec(`shred -u ${absolute} 2>/dev/null || rm -f ${absolute}`, 60).catch(() => undefined);
  }

  return tailscaleStatus(box);
}

/** Idempotent: a box that never joined is already in the desired state. */
export async function disableTailscale(box: ConnectivityBox): Promise<void> {
  await box.exec(`tailscale --socket=${SOCKET} down 2>/dev/null || true`, 60).catch(() => undefined);
  await box.exec(`sudo systemctl disable --now ${UNIT} 2>/dev/null || true`, 120).catch(() => undefined);
  await box.exec("rm -f /home/user/.tailscale/authkey-* 2>/dev/null || true", 60).catch(() => undefined);
}

function sanitizeHostname(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 63) : "zap-box";
}
