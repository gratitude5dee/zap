// `zap pay link` — Stripe Link agent wallet. Credentials never reach stdout
// (C24), Zap never custodies funds (C8), and every payload printed is pruned
// through the safe-field allowlist. The link-cli binary is faked via
// ZAP_LINK_CLI_ENTRY so no network or real wallet is involved.
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let dir: string;

function fakeCli(script: string): string {
  const entry = path.join(dir, "fake-link-cli.js");
  writeFileSync(entry, script);
  chmodSync(entry, 0o755);
  return entry;
}

const ECHO_ARGS = `
const fs = require("node:fs");
const path = require("node:path");
fs.writeFileSync(path.join(__dirname, "argv.json"), JSON.stringify(process.argv.slice(2)));
console.log(JSON.stringify({
  id: "spr_test_123",
  status: "pending_approval",
  amount: 500,
  currency: "usd",
  approval_url: "https://link.example/approve/spr_test_123",
  card_number: "4242424242424242",
  cvc: "123",
  pan: "4242424242424242",
}));
`;

interface Io {
  out: string[];
  err: string[];
}

async function run(args: string[]): Promise<{ code: number; io: Io }> {
  const { payLink } = await import("../src/commands/pay/link.js");
  const io: Io = { out: [], err: [] };
  const code = await payLink(args, {
    out: (m: string) => io.out.push(m),
    error: (m: string) => io.err.push(m),
  });
  return { code, io };
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "zap-link-"));
  process.env.ZAP_LINK_AUTH_DIR = path.join(dir, "auth");
  process.env.ZAP_LINK_CLI_ENTRY = fakeCli(ECHO_ARGS);
});

afterEach(() => {
  delete process.env.ZAP_LINK_AUTH_DIR;
  delete process.env.ZAP_LINK_CLI_ENTRY;
});

const CONTEXT =
  "Purchase one test widget from the example merchant to validate the Zap Link agent wallet flow end to end in test mode.";

describe("zap pay link", () => {
  it("status without stored auth reports not connected and never spawns the CLI", async () => {
    const { code, io } = await run(["status", "--json"]);
    expect(code).toBe(0);
    expect(JSON.parse(io.out[0])).toEqual({ connected: false });
  });

  it("request (card) forwards the create argv and prunes credentials from stdout", async () => {
    const outputFile = path.join(dir, "card.json");
    const { code, io } = await run([
      "request",
      "--amount",
      "500",
      "--context",
      CONTEXT,
      "--merchant-name",
      "Example",
      "--merchant-url",
      "https://merchant.example",
      "--output-file",
      outputFile,
      "--test",
      "--json",
    ]);
    expect(code).toBe(0);
    const argv = JSON.parse(readFileSync(path.join(dir, "argv.json"), "utf8")) as string[];
    expect(argv.slice(0, 2)).toEqual(["--auth", path.join(dir, "auth", "auth.json")]);
    expect(argv).toContain("spend-request");
    expect(argv).toContain("create");
    expect(argv).toContain("--amount=500");
    expect(argv).toContain("--currency=usd");
    expect(argv).toContain(`--context=${CONTEXT}`);
    expect(argv).toContain("--merchant-name=Example");
    expect(argv).toContain("--merchant-url=https://merchant.example");
    expect(argv).toContain(`--output-file=${outputFile}`);
    expect(argv).toContain("--test");
    const printed = io.out.join("\n");
    expect(printed).toContain("spr_test_123");
    expect(printed).toContain("approval_url");
    expect(printed).not.toContain("4242424242424242");
    expect(printed).not.toContain("card_number");
    expect(printed).not.toContain("cvc");
  });

  it("request (card) without --output-file is refused before spawning", async () => {
    const { code, io } = await run([
      "request",
      "--amount",
      "500",
      "--context",
      CONTEXT,
      "--merchant-name",
      "Example",
      "--merchant-url",
      "https://merchant.example",
    ]);
    expect(code).toBe(2);
    expect(io.err[0]).toContain("--output-file");
  });

  it("request (shared_payment_token) requires --network-id and skips merchant fields", async () => {
    const refused = await run([
      "request",
      "--amount",
      "500",
      "--context",
      CONTEXT,
      "--credential-type",
      "shared_payment_token",
    ]);
    expect(refused.code).toBe(2);
    expect(refused.io.err[0]).toContain("--network-id");

    const { code } = await run([
      "request",
      "--amount",
      "500",
      "--context",
      CONTEXT,
      "--credential-type",
      "shared_payment_token",
      "--network-id",
      "net_123",
      "--test",
    ]);
    expect(code).toBe(0);
    const argv = JSON.parse(readFileSync(path.join(dir, "argv.json"), "utf8")) as string[];
    expect(argv).toContain("--credential-type=shared_payment_token");
    expect(argv).toContain("--network-id=net_123");
    expect(argv.some((a) => a.startsWith("--merchant-name"))).toBe(false);
  });

  it("request refuses a short --context (owner must be able to judge the purchase)", async () => {
    const { code, io } = await run(["request", "--amount", "500", "--context", "buy a thing"]);
    expect(code).toBe(2);
    expect(io.err[0]).toContain("--context");
  });

  it("retrieve --include card without --output-file is refused (credentials never on stdout)", async () => {
    const { code, io } = await run(["retrieve", "spr_test_123", "--include", "card"]);
    expect(code).toBe(2);
    expect(io.err[0]).toContain("--output-file");
  });

  it("cancel forwards the id", async () => {
    const { code } = await run(["cancel", "spr_test_123", "--json"]);
    expect(code).toBe(0);
    const argv = JSON.parse(readFileSync(path.join(dir, "argv.json"), "utf8")) as string[];
    expect(argv).toContain("cancel");
    expect(argv).toContain("spr_test_123");
  });

  it("surfaces a safe error when the CLI reports a failure payload", async () => {
    process.env.ZAP_LINK_CLI_ENTRY = fakeCli(
      `console.log(JSON.stringify({ error: "REAUTHENTICATION_REQUIRED" }));`,
    );
    const { code, io } = await run(["list"]);
    expect(code).toBe(1);
    expect(io.err[0]).toContain("REAUTHENTICATION_REQUIRED");
    expect(io.err[0]).not.toContain("stack");
  });
});

describe("safeLinkFields", () => {
  it("drops non-allowlisted and non-scalar fields", async () => {
    const { safeLinkFields } = await import("../src/lib/link-wallet.js");
    const safe = safeLinkFields({
      id: "spr_1",
      status: "approved",
      card: { number: "4242424242424242" },
      shared_payment_token: "spt_secret",
      token: "tok_secret",
    });
    expect(safe).toEqual({ id: "spr_1", status: "approved" });
  });
});
