// @ts-check
import { printJson } from "../../lib/output.js";
import { supportedProviderIds } from "../../lib/recipe.js";
import { getProviderAdapter } from "@wzrdtech/providers";
import { decryptValue, encryptValue, readAuthStore, readCredentialStore, secretsForProvider, writeCredentialStore } from "../../lib/store.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "keys",
  summary: "Manage encrypted BYOK provider keys",
  usage: "zap keys [add|list|test|remove|sync] [--json]",
  async run({ args, flags }) {
    const subcommand = args[0] ?? "list";
    if (subcommand === "add") return keysAdd(args.slice(1), flags);
    if (subcommand === "list") return keysList(flags);
    if (subcommand === "remove") return keysRemove(args.slice(1), flags);
    if (subcommand === "test") return keysTest(args.slice(1), flags);
    if (subcommand === "sync") return keysSync(flags);
    throw new Error("Usage: zap keys [add|list|test|remove|sync] [--json]");
  },
};

async function keysAdd(args, flags) {
  const provider = args[0] ?? flags.provider;
  if (!provider) throw new Error("Usage: zap keys add <provider> <secretType> <value>");
  const adapter = getProviderAdapter(provider);
  const secretType = String(flags.type ?? args[1] ?? adapter.secretTypes[0]);
  if (!adapter.secretTypes.includes(secretType)) {
    throw new Error(`${secretType} is not valid for ${provider}. Expected ${adapter.secretTypes.join(", ")}.`);
  }
  const value = String(flags.value ?? args[2] ?? process.env[secretType.toUpperCase()] ?? "");
  if (!value) throw new Error(`Secret value required for ${secretType}. Use --value or pass it as an argument.`);
  const store = await readCredentialStore();
  store.secrets[secretType] = {
    ...encryptValue(value),
    last4: value.slice(-4),
    provider,
    secretType,
    updatedAt: new Date().toISOString(),
  };
  await writeCredentialStore(store);
  const result = { ok: true, provider, secretType, last4: value.slice(-4) };
  if (flags.json) printJson(result);
  else console.log(`Saved ${provider}/${secretType} ****${value.slice(-4)}`);
}

async function keysList(flags) {
  const store = await readCredentialStore();
  const secrets = Object.values(store.secrets).map((entry) => ({
    last4: entry.last4,
    provider: entry.provider,
    secretType: entry.secretType,
    updatedAt: entry.updatedAt,
  }));
  if (flags.json) printJson({ secrets });
  else secrets.forEach((secret) => console.log(`${secret.provider}/${secret.secretType} ****${secret.last4}`));
}

async function keysRemove(args, flags) {
  const secretType = String(flags.type ?? args.at(-1) ?? "");
  if (!secretType) throw new Error("Usage: zap keys remove <secretType>");
  const store = await readCredentialStore();
  delete store.secrets[secretType];
  await writeCredentialStore(store);
  if (flags.json) printJson({ ok: true, secretType });
  else console.log(`Removed ${secretType}`);
}

async function keysTest(args, flags) {
  const provider = args[0] ?? flags.provider;
  const providers = provider ? [provider] : supportedProviderIds();
  const credentials = await readCredentialStore();
  const results = [];
  for (const id of providers) {
    const adapter = getProviderAdapter(id);
    results.push(await adapter.validateKey(secretsForProvider(credentials, id)));
  }
  if (flags.json) printJson({ results });
  else results.forEach((result) => console.log(`${result.ok ? "ok" : "fail"} ${result.provider}${result.error ? `: ${result.error}` : ""}`));
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

async function keysSync(flags) {
  const auth = await readAuthStore();
  const token = String(flags.token ?? auth.token ?? process.env.ZAP_TOKEN ?? "");
  if (!token) throw new Error("zap keys sync requires `zap login --token ...` or ZAP_TOKEN.");
  const apiBase = String(flags.apiUrl ?? auth.apiUrl ?? process.env.ZAP_API_URL ?? "https://zap.wzrd.tech").replace(/\/$/, "");
  const credentials = await readCredentialStore();
  const synced = [];
  for (const [secretType, entry] of Object.entries(credentials.secrets)) {
    const response = await fetch(`${apiBase}/api/secrets`, {
      body: JSON.stringify({ secretType, value: decryptValue(entry) }),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      method: "PUT",
    });
    if (!response.ok) throw new Error(`Sync failed for ${secretType}: ${await response.text()}`);
    synced.push(secretType);
  }
  if (flags.json) printJson({ ok: true, synced });
  else console.log(`Synced ${synced.length} secret(s) to ${apiBase}`);
}
