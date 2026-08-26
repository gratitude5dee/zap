// @ts-check
import { ZapCliError } from "../../lib/errors.js";
import { printJson } from "../../lib/output.js";
import { readAuthStore, writeAuthStore } from "../../lib/store.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "login",
  summary: "Store a Zap API token, or device-auth via --provider",
  usage: "zap login --token <token> [--api-url ...] | zap login --provider <id> [--json]",
  async run({ flags }) {
    if (flags.provider) return providerLogin(flags);
    const token = String(flags.token ?? process.env.ZAP_TOKEN ?? "");
    if (!token) throw new Error("Usage: zap login --token <token> [--api-url https://zap.wzrd.tech]");
    const apiUrl = String(flags.apiUrl ?? process.env.ZAP_API_URL ?? "https://zap.wzrd.tech").replace(/\/$/, "");
    const existing = await readAuthStore();
    await writeAuthStore({ ...existing, apiToken: token, apiUrl, token });
    if (flags.json) printJson({ apiUrl, ok: true });
    else console.log(`Logged in to ${apiUrl}`);
  },
};

/**
 * Device-code login for harness/gateway providers. Delegates to
 * @wzrdtech/zap-runtime/auth/device-auth; until that module ships, this
 * reports a structured error instead of pretending to authenticate.
 * @param {import("../../lib/args.js").CliFlags} flags
 */
async function providerLogin(flags) {
  const provider = String(flags.provider);
  let deviceAuth;
  try {
    deviceAuth = await import("@wzrdtech/zap-runtime/auth/device-auth");
  } catch (error) {
    const code = /** @type {{ code?: string }} */ (error).code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "ERR_PACKAGE_PATH_NOT_EXPORTED") {
      throw new ZapCliError({
        code: "PROVIDER_LOGIN_UNAVAILABLE",
        message: `Device auth for provider "${provider}" is not available in this build yet.`,
        remediation: "Use zap keys add <provider> for BYOK keys, or upgrade once zap-runtime device auth ships (Z6).",
      });
    }
    throw error;
  }
  const result = await deviceAuth.loginWithDeviceCode({ provider });
  const existing = await readAuthStore();
  await writeAuthStore({ ...existing, providers: { ...(existing.providers ?? {}), [provider]: result.tokenRef } });
  if (flags.json) printJson({ ok: true, provider });
  else console.log(`Logged in provider ${provider}`);
}
