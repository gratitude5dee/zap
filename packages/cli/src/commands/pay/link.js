/**
 * `zap pay link` — Stripe Link agent wallet (agentic payments).
 *
 * The wallet is buyer-side and owner-approved: `connect` links the owner's own
 * Link account (browser verification, phrase shown here), `request` creates a
 * spend request the owner approves in Link, and `retrieve` polls it. Full card
 * credentials are only ever written to an owner-supplied `--output-file`
 * (0600); stdout carries redacted, allowlisted fields only (C24). Zap never
 * custodies funds (C8): Link issues one-time credentials the owner approved.
 *
 * Subcommands:
 *   zap pay link connect [--json]                connect the owner's Link account
 *   zap pay link status [--json]                 wallet connection state
 *   zap pay link disconnect                      log out and remove local auth
 *   zap pay link request --amount <cents> --context <text> [...] [--json]
 *   zap pay link retrieve <id> [--output-file <path>] [--include card] [--json]
 *   zap pay link cancel <id> [--json]
 *   zap pay link list [--include-history] [--json]
 */
import {
  LinkWalletError,
  linkAuthExists,
  removeLinkAuth,
  runLinkCli,
  safeLinkFields,
} from "../../lib/link-wallet.js";

/**
 * @param {string[]} args
 * @param {string} name
 * @returns {string | undefined}
 */
function flagValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * @param {{ out: (m: string) => void }} io
 * @param {unknown} payload
 * @param {boolean} json
 */
function printSafe(io, payload, json) {
  const safe = safeLinkFields(payload);
  if (json) {
    io.out(JSON.stringify(safe, null, 2));
    return;
  }
  const rows = Array.isArray(safe) ? safe : [safe];
  for (const row of rows) {
    io.out(
      Object.entries(row)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(" "),
    );
  }
}

/**
 * @param {string[]} args
 * @param {{ out: (m: string) => void, error: (m: string) => void }} io
 * @returns {Promise<number>}
 */
export async function payLink(args, io) {
  const [sub, ...rest] = args;
  const json = rest.includes("--json");
  try {
    switch (sub) {
      case "connect": {
        const payload = await runLinkCli(["auth", "login", "--client-name=Zap"], { timeoutMs: 180_000 });
        printSafe(io, payload, json);
        if (!json) io.out("If a verification URL is shown above, open it and confirm the phrase in Link.");
        return 0;
      }
      case "status": {
        if (!(await linkAuthExists())) {
          if (json) io.out(JSON.stringify({ connected: false }, null, 2));
          else io.out("link wallet: not connected — run `zap pay link connect`.");
          return 0;
        }
        const payload = await runLinkCli(["auth", "status"]);
        printSafe(io, payload, json);
        return 0;
      }
      case "disconnect": {
        if (await linkAuthExists()) {
          await runLinkCli(["auth", "logout"], { timeoutMs: 10_000 }).catch(() => undefined);
        }
        await removeLinkAuth();
        if (json) io.out(JSON.stringify({ connected: false, ok: true }, null, 2));
        else io.out("Link wallet disconnected; local auth removed.");
        return 0;
      }
      case "request":
        return payLinkRequest(rest, io, json);
      case "retrieve": {
        const [id] = rest;
        if (!id || id.startsWith("--")) {
          io.error("Usage: zap pay link retrieve <spend-request-id> [--output-file <path>] [--include card] [--json]");
          return 2;
        }
        const argv = ["spend-request", "retrieve", id];
        const outputFile = flagValue(rest, "--output-file");
        if (outputFile) argv.push(`--output-file=${outputFile}`);
        if (rest.includes("--include") || rest.includes("--include=card")) {
          if (!outputFile) {
            io.error("--include card requires --output-file: credentials are written to a 0600 file, never stdout.");
            return 2;
          }
          argv.push("--include=card");
        }
        const timeout = flagValue(rest, "--timeout");
        if (timeout) argv.push(`--timeout=${timeout}`);
        const interval = flagValue(rest, "--interval");
        if (interval) argv.push(`--interval=${interval}`);
        const payload = await runLinkCli(argv, { timeoutMs: (Number(timeout ?? 30) + 15) * 1000 });
        printSafe(io, payload, json);
        return 0;
      }
      case "cancel": {
        const [id] = rest;
        if (!id || id.startsWith("--")) {
          io.error("Usage: zap pay link cancel <spend-request-id> [--json]");
          return 2;
        }
        const payload = await runLinkCli(["spend-request", "cancel", id]);
        printSafe(io, payload, json);
        return 0;
      }
      case "list": {
        const argv = ["spend-request", "list"];
        if (rest.includes("--include-history")) argv.push("--include-history");
        const payload = await runLinkCli(argv);
        printSafe(io, payload, json);
        return 0;
      }
      default:
        io.error(`Unknown pay link subcommand "${sub ?? ""}". Try: connect, status, disconnect, request, retrieve, cancel, list.`);
        return 2;
    }
  } catch (error) {
    if (error instanceof LinkWalletError) {
      io.error(error.message);
      return 1;
    }
    throw error;
  }
}

/**
 * `zap pay link request` — create an owner-approved spend request.
 * @param {string[]} rest
 * @param {{ out: (m: string) => void, error: (m: string) => void }} io
 * @param {boolean} json
 * @returns {Promise<number>}
 */
async function payLinkRequest(rest, io, json) {
  const amountRaw = flagValue(rest, "--amount");
  const amount = Number(amountRaw);
  if (!Number.isInteger(amount) || amount <= 0) {
    io.error("--amount must be a positive integer amount in cents.");
    return 2;
  }
  const context = flagValue(rest, "--context");
  if (!context || context.length < 100) {
    io.error("--context must describe the purchase in at least 100 characters; the owner reads it when approving.");
    return 2;
  }
  const credentialType = flagValue(rest, "--credential-type") ?? "card";
  if (credentialType !== "card" && credentialType !== "shared_payment_token") {
    io.error("--credential-type must be card or shared_payment_token.");
    return 2;
  }
  const argv = [
    "spend-request",
    "create",
    `--amount=${String(amount)}`,
    `--currency=${flagValue(rest, "--currency") ?? "usd"}`,
    `--context=${context}`,
    `--credential-type=${credentialType}`,
  ];
  if (credentialType === "shared_payment_token") {
    const networkId = flagValue(rest, "--network-id");
    if (!networkId) {
      io.error("--network-id is required for shared_payment_token (use the merchant's MPP network id).");
      return 2;
    }
    argv.push(`--network-id=${networkId}`);
  } else {
    const merchantName = flagValue(rest, "--merchant-name");
    const merchantUrl = flagValue(rest, "--merchant-url");
    if (!merchantName || !merchantUrl) {
      io.error("--merchant-name and --merchant-url are required for card spend requests.");
      return 2;
    }
    const outputFile = flagValue(rest, "--output-file");
    if (!outputFile) {
      io.error("--output-file is required for card requests: credentials are written to a 0600 file, never stdout.");
      return 2;
    }
    argv.push(`--merchant-name=${merchantName}`, `--merchant-url=${merchantUrl}`, `--output-file=${outputFile}`);
  }
  if (rest.includes("--test")) argv.push("--test");
  const payload = await runLinkCli(argv, { timeoutMs: 660_000 });
  printSafe(io, payload, json);
  if (!json) io.out("Approve the spend request in Link; then run `zap pay link retrieve <id>`.");
  return 0;
}
