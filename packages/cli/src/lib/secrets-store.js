// @ts-check
/**
 * Write-only agent secret store (§5.12): `.zap/secrets.json`, mode 0600,
 * scoped to (agent, alias). Values are AES-256-GCM encrypted at rest with
 * the same local key as `credentials.json`, synced in-memory to zap-agentd,
 * and never printed — `list` exposes names, scopes and last4 only.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { decryptValue, encryptValue } from "./store.js";

/**
 * @typedef {{ ciphertext: string, iv: string, tag: string }} EncryptedValue
 * @typedef {{ name: string, agent?: string, env?: string, value: EncryptedValue, last4: string, persistEnv?: boolean }} SecretEntry
 * @typedef {{ version: 1, secrets: SecretEntry[] }} SecretStore
 */

/** @param {string} cwd */
function storePath(cwd) {
  return path.join(cwd, ".zap", "secrets.json");
}

/**
 * @param {string} cwd
 * @returns {Promise<SecretStore>}
 */
export async function readSecretStore(cwd) {
  try {
    const raw = await fs.readFile(storePath(cwd), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.secrets)) return { version: 1, secrets: parsed.secrets };
  } catch {
    // fresh store
  }
  return { version: 1, secrets: [] };
}

/**
 * @param {string} cwd
 * @param {SecretStore} store
 */
export async function writeSecretStore(cwd, store) {
  const file = storePath(cwd);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(file, 0o600);
}

/**
 * @param {{ name: string, agent?: string, env?: string, value: string, persistEnv?: boolean }} input
 * @returns {SecretEntry}
 */
export function makeSecretEntry(input) {
  return {
    name: input.name,
    agent: input.agent,
    env: input.env,
    value: encryptValue(input.value),
    last4: input.value.slice(-4),
    persistEnv: input.persistEnv === true,
  };
}

/** @param {SecretEntry} entry */
export function secretValue(entry) {
  return decryptValue(entry.value);
}

/** @param {SecretEntry} entry */
export function describeSecret(entry) {
  return {
    name: entry.name,
    agent: entry.agent ?? "*",
    env: entry.env ?? "*",
    last4: entry.last4,
    persistEnv: entry.persistEnv === true,
  };
}

/**
 * @param {SecretStore} store
 * @param {{ name: string, agent?: string, env?: string }} key
 */
export function findSecretIndex(store, key) {
  return store.secrets.findIndex(
    (entry) => entry.name === key.name && (entry.agent ?? "") === (key.agent ?? "") && (entry.env ?? "") === (key.env ?? ""),
  );
}
