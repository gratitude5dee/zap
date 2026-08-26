import { payLoginManaged } from "@wzrdtech/zap-runtime/auth/managed";

const DEFAULT_API_URL = "https://zap.wzrd.tech/api/cloud";

function flagValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * `zap pay login --managed [--max-value <usd>] [--api-url <origin>]`
 * Authenticates the user's wallet (email/phone/passkey/SIWE via the browser)
 * and stores a session key scoped to the control API origin, a per-request
 * cap, and a 24 h expiry — mode 0600, never printed. Zap never holds the
 * wallet's own key.
 */
export async function payLogin(args, io) {
  if (!args.includes("--managed")) {
    io.error("Only managed login lives here. For provider keys use `zap login --provider <id>`.");
    return 2;
  }
  const maxValueRaw = flagValue(args, "--max-value");
  const maxValueUsd = maxValueRaw === undefined ? undefined : Number(maxValueRaw);
  if (maxValueUsd !== undefined && (!Number.isFinite(maxValueUsd) || maxValueUsd <= 0)) {
    io.error("--max-value must be a positive USD amount.");
    return 2;
  }
  const apiOrigin = flagValue(args, "--api-url") ?? io.env?.ZAP_API_URL ?? DEFAULT_API_URL;
  if (!io.walletAuth) {
    io.error("Wallet auth is unavailable in this environment. Run from a terminal with browser access.");
    return 1;
  }
  const record = await payLoginManaged({
    authenticate: io.walletAuth.authenticate,
    issueSessionKey: io.walletAuth.issueSessionKey,
    apiOrigin,
    maxValueUsd,
  });
  if (args.includes("--json")) {
    io.out(
      JSON.stringify(
        {
          payer: "managed",
          wallet: record.address,
          maxValueUsd: record.maxValueUsd,
          expiresAt: record.expiresAt,
        },
        null,
        2,
      ),
    );
  } else {
    io.out(`Managed payer ready: wallet ${record.address}, cap $${record.maxValueUsd}/request, expires ${record.expiresAt}.`);
  }
  return 0;
}
