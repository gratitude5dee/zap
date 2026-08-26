// @ts-check
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getProviderAdapter } from "@wzrdtech/providers";
import { zapConfigDir } from "./project.js";

export async function readCredentialStore() {
  const file = path.join(await zapConfigDir(), "credentials.json");
  if (!existsSync(file)) return { secrets: {}, version: 1 };
  const parsed = JSON.parse(await fs.readFile(file, "utf8"));
  return { secrets: parsed.secrets ?? {}, version: parsed.version ?? 1 };
}

/** @param {{ secrets?: Record<string, unknown> }} store */
export async function writeCredentialStore(store) {
  const dir = await zapConfigDir();
  const file = path.join(dir, "credentials.json");
  await fs.writeFile(file, JSON.stringify({ secrets: store.secrets ?? {}, version: 1 }, null, 2) + "\n", { mode: 0o600 });
  await fs.chmod(file, 0o600);
}

/**
 * `.zap/auth.json` is namespaced (Z3):
 * `{ apiToken, apiUrl, managed: { sessionKey, wallet, expiresAt } }`.
 * Legacy `zap logout` clears only `apiToken`; `zap pay logout` clears only `managed`.
 * Legacy stores that used `{ token }` are read transparently.
 */
export async function readAuthStore() {
  const file = path.join(await zapConfigDir(), "auth.json");
  if (!existsSync(file)) return {};
  const parsed = JSON.parse(await fs.readFile(file, "utf8"));
  if (parsed.token !== undefined && parsed.apiToken === undefined) {
    const { token, ...rest } = parsed;
    return { ...rest, apiToken: token, token };
  }
  if (parsed.apiToken !== undefined && parsed.token === undefined) {
    return { ...parsed, token: parsed.apiToken };
  }
  return parsed;
}

/** @param {Record<string, unknown>} auth */
export async function writeAuthStore(auth) {
  const file = path.join(await zapConfigDir(), "auth.json");
  const { token, ...rest } = auth;
  const record = { ...rest };
  if (record.apiToken === undefined && token !== undefined) record.apiToken = token;
  await fs.writeFile(file, JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
  await fs.chmod(file, 0o600);
}

/** @param {string} value */
export function encryptValue(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", localEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/** @param {{ ciphertext: string, iv: string, tag: string }} entry */
export function decryptValue(entry) {
  const decipher = createDecipheriv("aes-256-gcm", localEncryptionKey(), Buffer.from(entry.iv, "base64"));
  decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(entry.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function localEncryptionKey() {
  return scryptSync(`${os.userInfo().username}:${os.hostname()}`, "zap-cli-credentials-v1", 32);
}

/**
 * @param {{ secrets: Record<string, { ciphertext: string, iv: string, tag: string }> }} store
 * @param {string} provider
 */
export function secretsForProvider(store, provider) {
  const adapter = getProviderAdapter(provider);
  /** @type {Record<string, string>} */
  const secrets = {};
  for (const secretType of adapter.secretTypes) {
    const entry = store.secrets[secretType];
    if (entry) secrets[secretType] = decryptValue(entry);
  }
  return secrets;
}
