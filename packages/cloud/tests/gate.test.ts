import { describe, expect, it } from "vitest";
import {
  createTestCloud,
  x402Credential,
  x402V1Credential,
  mppCredential,
  TEST_TREASURY,
  type TestCloud,
} from "../src/testing.ts";

const ADAPTERS = ["vercel", "cloudflare"] as const;

async function makeRuntime(cloud: TestCloud, token = "token-alice"): Promise<string> {
  const res = await cloud.app.request("/v1/runtimes", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ weight: "light", provider: "box" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { id: string };
  return body.id;
}

function execPrompt(cloud: TestCloud, id: string, headers: Record<string, string> = {}) {
  return cloud.app.request(`/v1/runtimes/${id}/exec`, {
    method: "POST",
    headers: {
      authorization: "Bearer token-alice",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ prompt: "do something" }),
  });
}

describe.each(ADAPTERS)("pay gate (%s adapter)", (adapter) => {
  it("no credential -> 402 with both x402 v2 and MPP challenges", async () => {
    const cloud = createTestCloud({ adapter });
    const id = await makeRuntime(cloud);
    const res = await execPrompt(cloud, id);
    expect(res.status).toBe(402);
    expect(res.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
    expect(res.headers.get("WWW-Authenticate")).toMatch(/^Payment /);
    const required = JSON.parse(
      Buffer.from(res.headers.get("PAYMENT-REQUIRED") ?? "", "base64").toString("utf8"),
    ) as { x402Version: number; accepts: Array<{ payTo: string }> };
    expect(required.x402Version).toBe(2);
    expect(required.accepts[0]?.payTo).toBe(TEST_TREASURY);
  });

  it("valid x402 v2 PAYMENT-SIGNATURE -> verify, settle, receipt, 200 + PAYMENT-RESPONSE", async () => {
    const cloud = createTestCloud({ adapter });
    const id = await makeRuntime(cloud);
    const res = await execPrompt(cloud, id, {
      "PAYMENT-SIGNATURE": x402Credential({ nonce: "nonce-1", amountUsd: 1 }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
    const receipts = await cloud.deps.receipts.list();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.protocol).toBe("x402");
    expect(receipts[0]?.payTo).toBe(TEST_TREASURY);
  });

  it("x402 v1 X-PAYMENT -> 402 upgrade hint by default", async () => {
    const cloud = createTestCloud({ adapter });
    const id = await makeRuntime(cloud);
    const res = await execPrompt(cloud, id, {
      "X-PAYMENT": x402V1Credential({ nonce: "nonce-v1", amountUsd: 1 }),
    });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/PAYMENT-SIGNATURE|x402 v2/i);
  });

  it("x402 v1 X-PAYMENT settles through the shim when ZAP_X402_V1_SHIM=1", async () => {
    const cloud = createTestCloud({ adapter, env: { ZAP_X402_V1_SHIM: "1" } });
    const id = await makeRuntime(cloud);
    const res = await execPrompt(cloud, id, {
      "X-PAYMENT": x402V1Credential({ nonce: "nonce-v1b", amountUsd: 1 }),
    });
    expect(res.status).toBe(200);
    const receipts = await cloud.deps.receipts.list();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.protocol).toBe("x402-v1");
  });

  it("valid MPP Authorization: Payment -> Payment-Receipt", async () => {
    const cloud = createTestCloud({ adapter });
    const id = await makeRuntime(cloud);
    const res = await cloud.app.request(`/v1/runtimes/${id}/exec`, {
      method: "POST",
      headers: {
        "x-zap-principal": "token-alice",
        "content-type": "application/json",
        authorization: `Payment ${mppCredential({ challengeId: "chal-1", amountUsd: 1 })}`,
      },
      body: JSON.stringify({ prompt: "do something" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Payment-Receipt")).toBeTruthy();
    const receipts = await cloud.deps.receipts.list();
    expect(receipts[0]?.protocol).toBe("mpp");
  });

  it("replayed nonce -> 402 already redeemed, one receipt row", async () => {
    const cloud = createTestCloud({ adapter });
    const id = await makeRuntime(cloud);
    const cred = x402Credential({ nonce: "nonce-replay", amountUsd: 1 });
    const first = await execPrompt(cloud, id, { "PAYMENT-SIGNATURE": cred });
    expect(first.status).toBe(200);
    const second = await execPrompt(cloud, id, { "PAYMENT-SIGNATURE": cred });
    expect(second.status).toBe(402);
    const body = (await second.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/already redeemed/i);
    expect(await cloud.deps.receipts.list()).toHaveLength(1);
  });

  it("underpayment -> 402", async () => {
    const cloud = createTestCloud({ adapter });
    const id = await makeRuntime(cloud);
    const res = await execPrompt(cloud, id, {
      "PAYMENT-SIGNATURE": x402Credential({ nonce: "nonce-under", amountUsd: 0.000001 }),
    });
    expect(res.status).toBe(402);
    expect(await cloud.deps.receipts.list()).toHaveLength(0);
  });

  it("facilitator error -> 402 and no meter row", async () => {
    const cloud = createTestCloud({ adapter, facilitatorFails: true });
    const id = await makeRuntime(cloud);
    const res = await execPrompt(cloud, id, {
      "PAYMENT-SIGNATURE": x402Credential({ nonce: "nonce-err", amountUsd: 1 }),
    });
    expect(res.status).toBe(402);
    expect(await cloud.deps.receipts.list()).toHaveLength(0);
    expect(cloud.events.filter((e) => e === "meter.reserve")).toHaveLength(0);
  });

  it("payTo is always the treasury, never derived from request data", async () => {
    const cloud = createTestCloud({ adapter });
    const id = await makeRuntime(cloud);
    const res = await cloud.app.request(`/v1/runtimes/${id}/exec?payTo=0xattacker`, {
      method: "POST",
      headers: {
        authorization: "Bearer token-alice",
        "content-type": "application/json",
        "x-pay-to": "0xattacker",
      },
      body: JSON.stringify({ prompt: "hi", payTo: "0xattacker" }),
    });
    expect(res.status).toBe(402);
    const required = JSON.parse(
      Buffer.from(res.headers.get("PAYMENT-REQUIRED") ?? "", "base64").toString("utf8"),
    ) as { accepts: Array<{ payTo: string }> };
    expect(required.accepts[0]?.payTo).toBe(TEST_TREASURY);
    expect(required.accepts[0]?.payTo).not.toContain("attacker");
  });

  it("exec with a command is not gated", async () => {
    const cloud = createTestCloud({ adapter });
    const id = await makeRuntime(cloud);
    const res = await cloud.app.request(`/v1/runtimes/${id}/exec`, {
      method: "POST",
      headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
      body: JSON.stringify({ command: ["echo", "hello"] }),
    });
    expect(res.status).toBe(200);
  });

  it("exec with a prompt is gated in live mode too", async () => {
    const cloud = createTestCloud({ adapter });
    const id = await makeRuntime(cloud);
    const res = await cloud.app.request(`/v1/runtimes/${id}/exec`, {
      method: "POST",
      headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
      body: JSON.stringify({ prompt: "hi", live: true }),
    });
    expect(res.status).toBe(402);
  });

  it("a route module mounted behind the gate (sessions turns stub) is gated the same way", async () => {
    const cloud = createTestCloud({
      adapter,
      modules: [
        {
          name: "sessions-stub",
          mount(app, { gate }) {
            app.post("/v1/sessions/:id/turns", gate, (c) => c.json({ ok: true }));
          },
        },
      ],
    });
    const bare = await cloud.app.request("/v1/sessions/s1/turns", {
      method: "POST",
      headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(bare.status).toBe(402);
    const paid = await cloud.app.request("/v1/sessions/s1/turns", {
      method: "POST",
      headers: {
        authorization: "Bearer token-alice",
        "content-type": "application/json",
        "PAYMENT-SIGNATURE": x402Credential({ nonce: "nonce-sess", amountUsd: 1 }),
      },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(paid.status).toBe(200);
  });

  it("the reservation is created only after the receipt", async () => {
    const cloud = createTestCloud({ adapter });
    const id = await makeRuntime(cloud);
    const res = await execPrompt(cloud, id, {
      "PAYMENT-SIGNATURE": x402Credential({ nonce: "nonce-order", amountUsd: 1 }),
    });
    expect(res.status).toBe(200);
    const receiptIndex = cloud.events.indexOf("receipt.insert");
    const reserveIndex = cloud.events.indexOf("meter.reserve");
    expect(receiptIndex).toBeGreaterThanOrEqual(0);
    expect(reserveIndex).toBeGreaterThan(receiptIndex);
  });

  it("Accept: text/html gets a pay page without any token", async () => {
    const cloud = createTestCloud({ adapter });
    const id = await makeRuntime(cloud);
    const res = await execPrompt(cloud, id, { accept: "text/html" });
    expect(res.status).toBe(402);
    const html = await res.text();
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(html).not.toContain("token-alice");
    expect(html).not.toContain("secret");
  });
});
