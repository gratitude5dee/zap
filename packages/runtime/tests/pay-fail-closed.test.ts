import { mkdtempSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createContext, type Context, type RunInput, type RunResult } from "@wzrdtech/zap-kernel";
import { payByok } from "../src/pay/byok.ts";
import { x402 } from "../src/pay/x402.ts";
import { wrapFetchWithPayment, type PaymentSigner } from "../src/pay/client.ts";
import { PayError } from "../src/pay/errors.ts";
import { createMeter, memoryMeterStore } from "../src/meter/index.ts";
import { memoryLedger } from "../src/meter/ledger.ts";
import { memoryBalances } from "../src/meter/balances.ts";
import { registerSecret, scrub, resetRedaction } from "../src/auth/redact.ts";
import { deviceLogin } from "../src/auth/device-auth.ts";
import { payLoginManaged } from "../src/auth/managed.ts";

interface HarnessDriver {
  run(input: RunInput): Promise<RunResult>;
}

function stubDriver(): { driver: HarnessDriver; calls: RunInput[] } {
  const calls: RunInput[] = [];
  const driver: HarnessDriver = {
    async run(input: RunInput): Promise<RunResult> {
      calls.push(input);
      return {
        id: "run_stub",
        status: "completed",
        events: [
          { type: "run.started", live: input.live ?? false, payer: "byok" },
          {
            type: "run.completed",
            usage: {
              lines: [
                { unit: "gateway_input_token", qty: 1000, sku: "openrouter/test/model" },
                { unit: "gateway_output_token", qty: 200, sku: "openrouter/test/model" },
              ],
            },
          },
        ],
      };
    },
  };
  return { driver, calls };
}

function makeMeter() {
  const ledger = memoryLedger();
  const meter = createMeter({
    store: memoryMeterStore(),
    ledger,
    balances: memoryBalances(),
    payer: "byok",
    env: { ZAP_DAILY_CAP_USD: "10" },
    modelRates: { "openrouter/test/model": { inputUsdPerMTok: 3, outputUsdPerMTok: 15 } },
  });
  return { meter, ledger };
}

async function mountPay(
  ctx: Context,
  env: Record<string, string | undefined>,
  driver: HarnessDriver,
  meter: ReturnType<typeof makeMeter>["meter"],
): Promise<HarnessDriver> {
  ctx.provide("meter", meter);
  await ctx.plugin(payByok.plugin, { env });
  ctx.provide("harness", driver);
  return ctx.inject<HarnessDriver>("harness");
}

describe("pay fail-closed", () => {
  beforeEach(() => {
    resetRedaction();
  });

  it("--live with a missing payer fails with PAYER_MISSING", async () => {
    const ctx = createContext();
    const { driver, calls } = stubDriver();
    const { meter } = makeMeter();
    const harness = await mountPay(ctx, {}, driver, meter);
    await expect(harness.run({ prompt: "hi", live: true })).rejects.toMatchObject({
      code: "PAYER_MISSING",
    });
    expect(calls).toHaveLength(0);
    await ctx.dispose();
  });

  it("a prompt with a missing payer fails with PAYER_MISSING before the driver is called", async () => {
    const ctx = createContext();
    const { driver, calls } = stubDriver();
    const { meter } = makeMeter();
    const harness = await mountPay(ctx, {}, driver, meter);
    await expect(harness.run({ prompt: "plan something" })).rejects.toMatchObject({
      code: "PAYER_MISSING",
    });
    expect(calls).toHaveLength(0);
    await ctx.dispose();
  });

  it("a prompt with a payer and no --live reaches the driver with live:false and settles usage", async () => {
    const ctx = createContext();
    const { driver, calls } = stubDriver();
    const { meter, ledger } = makeMeter();
    const harness = await mountPay(ctx, { ZAP_PAYER_MODE: "byok" }, driver, meter);
    const result = await harness.run({ prompt: "plan something" });
    expect(result.status).toBe("completed");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.live).toBe(false);
    const entries = ledger.entries();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((line) => line.unit === "gateway_input_token")).toBe(true);
    await ctx.dispose();
  });

  it("BYOK keys never appear in log lines", () => {
    const key = "sk-byok-canary-1234567890";
    registerSecret(key);
    const line = scrub(`resolved provider key ${key} for openrouter`);
    expect(line).not.toContain(key);
    expect(line).toContain("[redacted]");
  });

  it("device-auth tokens are stored mode 0600 and never printed", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "zap-device-"));
    const logs: string[] = [];
    const result = await deviceLogin("claude-code", {
      zapDir: dir,
      log: (line: string) => logs.push(line),
      exec: async () => ({ stdout: "sk-ant-oat-canary-token", exitCode: 0 }),
    });
    const stat = await fs.stat(result.storedAt);
    expect(stat.mode & 0o777).toBe(0o600);
    const joined = logs.join("\n");
    expect(joined).not.toContain("sk-ant-oat-canary-token");
  });

  it("managed session keys are stored mode 0600", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "zap-auth-"));
    const session = await payLoginManaged({
      zapDir: dir,
      apiOrigin: "https://cloud.example",
      authenticate: async () => ({ address: "0x2222222222222222222222222222222222222222" }),
      issueSessionKey: async () => ({
        key: "sess-canary-key",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    });
    expect(session.maxValueUsd).toBe(5);
    expect(session.principal).toBe("wallet:0x2222222222222222222222222222222222222222");
    const stat = await fs.stat(path.join(dir, "auth.json"));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("the client wrapper refuses a payment above maxValue", async () => {
    const signer: PaymentSigner = {
      address: "0x3333333333333333333333333333333333333333",
      async signPayment() {
        return "signed";
      },
    };
    const accepts = {
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          maxAmountRequired: "9000000",
          payTo: "0x4444444444444444444444444444444444444444",
          asset: "usdc",
          resource: "https://cloud.example/v1/runtimes/rt/exec",
        },
      ],
    };
    const fetchImpl = (async () =>
      new Response("payment required", {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(accepts)).toString("base64"),
        },
      })) as typeof fetch;
    const wrapped = wrapFetchWithPayment(fetchImpl, signer, { maxValueUsd: 5 });
    await expect(wrapped("https://cloud.example/v1/runtimes/rt/exec")).rejects.toMatchObject({
      code: "PAYMENT_ABOVE_CAP",
    });
    expect(PayError).toBeDefined();
  });

  it("x402 plugin reports managed mode when a wallet is configured", async () => {
    const ctx = createContext();
    ctx.provide("meter", makeMeter().meter);
    await ctx.plugin(x402.plugin, {
      chain: "base",
      env: { ZAP_WALLET_ADDRESS: "0x5555555555555555555555555555555555555555" },
    });
    const pay = await ctx.inject<{ status(): string; payer(): { mode: string } | null }>("pay");
    expect(pay.status()).toBe("managed");
    expect(pay.payer()?.mode).toBe("managed");
    await ctx.dispose();
  });
});
