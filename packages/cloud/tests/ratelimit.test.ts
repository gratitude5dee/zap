import { describe, expect, it } from "vitest";
import { createTestCloud, x402Credential } from "../src/testing.ts";

const ADAPTERS = ["vercel", "cloudflare"] as const;

describe.each(ADAPTERS)("rate limits (%s adapter)", (adapter) => {
  it("limits POST /v1/runtimes per principal", async () => {
    const cloud = createTestCloud({ adapter, limits: { runtimesPerHour: 2 } });
    const make = () =>
      cloud.app.request("/v1/runtimes", {
        method: "POST",
        headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
        body: JSON.stringify({ weight: "light", provider: "box" }),
      });
    expect((await make()).status).toBe(200);
    expect((await make()).status).toBe(200);
    expect((await make()).status).toBe(429);

    const bob = await cloud.app.request("/v1/runtimes", {
      method: "POST",
      headers: { authorization: "Bearer token-bob", "content-type": "application/json" },
      body: JSON.stringify({ weight: "light", provider: "box" }),
    });
    expect(bob.status).toBe(200);
  });

  it("limits exec per runtime", async () => {
    const cloud = createTestCloud({ adapter, limits: { execPerMinute: 2 } });
    const created = await cloud.app.request("/v1/runtimes", {
      method: "POST",
      headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
      body: JSON.stringify({ weight: "light", provider: "box" }),
    });
    const { id } = (await created.json()) as { id: string };
    const exec = () =>
      cloud.app.request(`/v1/runtimes/${id}/exec`, {
        method: "POST",
        headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
        body: JSON.stringify({ command: ["ls"] }),
      });
    expect((await exec()).status).toBe(200);
    expect((await exec()).status).toBe(200);
    expect((await exec()).status).toBe(429);
  });

  it("limits the gate per principal and counts rejections", async () => {
    const cloud = createTestCloud({ adapter, limits: { gatePerMinute: 2 } });
    const created = await cloud.app.request("/v1/runtimes", {
      method: "POST",
      headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
      body: JSON.stringify({ weight: "light", provider: "box" }),
    });
    const { id } = (await created.json()) as { id: string };
    const attempt = (nonce: string) =>
      cloud.app.request(`/v1/runtimes/${id}/exec`, {
        method: "POST",
        headers: {
          authorization: "Bearer token-alice",
          "content-type": "application/json",
          "PAYMENT-SIGNATURE": x402Credential({ nonce, amountUsd: 1 }),
        },
        body: JSON.stringify({ prompt: "hi" }),
      });
    expect((await attempt("n1")).status).toBe(200);
    expect((await attempt("n2")).status).toBe(200);
    expect((await attempt("n3")).status).toBe(429);
  });
});
