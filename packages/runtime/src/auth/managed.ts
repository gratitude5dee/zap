import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerSecret } from "./redact.ts";
import { AuthError } from "./byok.ts";

export interface SessionKeyRecord {
  principal: string;
  address: string;
  sessionKey: string;
  maxValueUsd: number;
  target: string;
  expiresAt: string;
}

export interface ManagedLoginDeps {
  /** thirdweb in-app/ecosystem wallet auth (email/phone/passkey/SIWE). */
  authenticate(): Promise<{ address: string }>;
  /** request a scoped session key from the authenticated wallet. */
  issueSessionKey(request: {
    address: string;
    maxValueUsd: number;
    target: string;
    expiresAt: string;
  }): Promise<{ key: string; expiresAt: string }>;
  apiOrigin: string;
  maxValueUsd?: number;
  zapDir?: string;
  now?: () => Date;
}

/** `.zap/auth.json` is namespaced: legacy `zap logout` clears `apiToken`,
 * `zap pay logout` clears only `managed`. */
export interface AuthFile {
  apiToken?: string;
  apiUrl?: string;
  managed?: SessionKeyRecord;
}

const DEFAULT_MAX_VALUE_USD = 5;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function authFile(zapDir?: string): string {
  return path.join(zapDir ?? path.join(os.homedir(), ".zap"), "auth.json");
}

async function readAuthFile(file: string): Promise<AuthFile> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as AuthFile;
  } catch {
    return {};
  }
}

async function writeAuthFile(file: string, data: AuthFile): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  await fs.chmod(file, 0o600);
}

/**
 * `zap pay login --managed`: authenticate the user's wallet, request a
 * session key scoped to {maxValue, control API origin, 24 h expiry}, and
 * store it 0600 in `.zap/auth.json`. Zap never holds the wallet's own key.
 */
export async function payLoginManaged(deps: ManagedLoginDeps): Promise<SessionKeyRecord> {
  const now = deps.now ?? (() => new Date());
  const { address } = await deps.authenticate();
  const maxValueUsd = deps.maxValueUsd ?? DEFAULT_MAX_VALUE_USD;
  const expiresAt = new Date(now().getTime() + SESSION_TTL_MS).toISOString();
  const issued = await deps.issueSessionKey({
    address,
    maxValueUsd,
    target: deps.apiOrigin,
    expiresAt,
  });
  registerSecret(issued.key);
  const record: SessionKeyRecord = {
    principal: `wallet:${address.toLowerCase()}`,
    address,
    sessionKey: issued.key,
    maxValueUsd,
    target: deps.apiOrigin,
    expiresAt: issued.expiresAt,
  };
  const file = authFile(deps.zapDir);
  const existing = await readAuthFile(file);
  await writeAuthFile(file, { ...existing, managed: record });
  return record;
}

/** Clears only the `managed` namespace; `apiToken`/`apiUrl` survive. */
export async function payLogout(deps?: { zapDir?: string }): Promise<void> {
  const file = authFile(deps?.zapDir);
  const existing = await readAuthFile(file);
  if (existing.managed === undefined) return;
  delete existing.managed;
  await writeAuthFile(file, existing);
}

/** Load the stored session key; refuses group/world-readable files. */
export async function loadSessionKey(deps?: { zapDir?: string }): Promise<SessionKeyRecord | null> {
  const file = authFile(deps?.zapDir);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
  const stat = await fs.stat(file);
  if ((stat.mode & 0o077) !== 0) {
    throw new AuthError(
      "AUTH_FILE_INSECURE",
      `${file} must be mode 0600.`,
      `Run: chmod 600 ${file}`,
    );
  }
  const record = (JSON.parse(raw) as AuthFile).managed;
  if (!record) return null;
  registerSecret(record.sessionKey);
  return record;
}
