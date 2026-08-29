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
 *   zap pay link pay <url> [--spend-request-id <id>] [...] [--json]
 */
import dns from "node:dns/promises";
import { isIP } from "node:net";

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
        const safe = safeLinkFields(payload);
        const details = Array.isArray(safe) ? (safe.at(-1) ?? {}) : safe;
        const connected = details.authenticated !== false;
        if (json) io.out(JSON.stringify({ connected, ...details }, null, 2));
        else printSafe(io, { connected, ...details }, json);
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
        if (rest.includes("--force")) argv.push("--force");
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
      case "pay":
        return payLinkPay(rest, io, json);
      default:
        io.error(`Unknown pay link subcommand "${sub ?? ""}". Try: connect, status, disconnect, request, retrieve, cancel, list, pay.`);
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
  if (!json) {
    if (credentialType === "card") {
      const outputFile = flagValue(rest, "--output-file");
      io.out(
        `Approve the spend request in Link. If the card file was not written yet, run \`zap pay link retrieve <id> --include card --output-file ${outputFile}\`.`,
      );
    } else {
      io.out("Approve the spend request in Link; then run `zap pay link pay <url> --spend-request-id <id>` to complete the HTTP 402 payment.");
    }
  }
  return 0;
}

/**
 * @param {string} address IPv4 or IPv6 literal (no brackets)
 * @returns {boolean} true when the address is loopback/private/link-local
 */
function isPrivateAddress(address) {
  let host = address.toLowerCase();
  if (host.startsWith("::ffff:")) {
    const mapped = host.slice(7);
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped);
    if (hex) {
      const hi = Number.parseInt(hex[1], 16);
      const lo = Number.parseInt(hex[2], 16);
      host = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
    } else {
      host = mapped;
    }
  }
  if (host.includes(":")) {
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fe80:") ||
      host.startsWith("fc") ||
      host.startsWith("fd")
    );
  }
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/**
 * Merchant URLs must be public https endpoints: link-cli fetches the URL from
 * this host, so loopback/private/link-local destinations would let a caller
 * point the payment at internal services. DNS names are resolved and every
 * resolved address is checked, so internal-resolving names are refused too.
 * @param {string} raw
 * @returns {Promise<boolean>}
 */
async function isPayableMerchantUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(".") && !host.includes(":")) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  if (isIP(host)) return !isPrivateAddress(host);
  /** @type {{ address: string }[]} */
  let resolved;
  try {
    resolved = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    return false;
  }
  return resolved.length > 0 && resolved.every(({ address }) => !isPrivateAddress(address));
}

/**
 * `zap pay link pay` — complete an HTTP 402 payment with a shared payment
 * token via `link-cli mpp pay`. The token stays inside link-cli: it is spent
 * against the merchant URL directly and never surfaces on stdout (C24).
 * @param {string[]} rest
 * @param {{ out: (m: string) => void, error: (m: string) => void }} io
 * @param {boolean} json
 * @returns {Promise<number>}
 */
async function payLinkPay(rest, io, json) {
  const [url] = rest;
  if (!url || url.startsWith("--")) {
    io.error("Usage: zap pay link pay <url> [--spend-request-id <id>] [--context <text>] [--amount <cents>] [--method <m>] [--data <body>] [--test] [--json]");
    return 2;
  }
  if (!(await isPayableMerchantUrl(url))) {
    io.error("pay requires a public https:// merchant URL (loopback, private, and link-local hosts are refused).");
    return 2;
  }
  const argv = ["mpp", "pay", url];
  const spendRequestId = flagValue(rest, "--spend-request-id");
  if (spendRequestId) {
    argv.push(`--spend-request-id=${spendRequestId}`);
  } else {
    const context = flagValue(rest, "--context");
    if (!context || context.length < 100) {
      io.error("--context (min 100 chars) is required when --spend-request-id is not provided; the owner reads it when approving.");
      return 2;
    }
    argv.push(`--context=${context}`);
  }
  const amount = flagValue(rest, "--amount");
  if (amount) argv.push(`--amount=${amount}`);
  const method = flagValue(rest, "--method");
  if (method) argv.push(`--method=${method}`);
  const data = flagValue(rest, "--data");
  if (data) argv.push(`--data=${data}`);
  if (rest.includes("--test")) argv.push("--test");
  const payload = await runLinkCli(argv, { timeoutMs: 660_000 });
  printSafe(io, payload, json);
  return 0;
}
