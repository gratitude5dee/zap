import { describe, expect, it } from "vitest";
import { createTestCloud, x402Credential, type TestCloud } from "../src/testing.ts";

const ADAPTERS = ["vercel", "cloudflare"] as const;

async function makeRuntime(cloud: TestCloud): Promise<string> {
  const res = await cloud.app.request("/v1/runtimes", {
    method: "POST",
    headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
    body: JSON.stringify({ weight: "light", provider: "box" }),
  });
  const body = (await res.json()) as { id: string };
  return body.id;
}

describe.each(ADAPTERS)("stranger tenancy (%s adapter)", (adapter) => {
  it("a second principal cannot see or touch another tenant's runtime", async () => {
    const cloud = createTestCloud({ adapter });
    const id = await makeRuntime(cloud);
    const bob = { authorization: "Bearer token-bob", "content-type": "application/json" };

    const list = await cloud.app.request("/v1/runtimes", { headers: bob });
    expect(list.status).toBe(200);
    const rows = (await list.json()) as Array<{ id: string }>;
    expect(rows.some((row) => row.id === id)).toBe(false);

    const exec = await cloud.app.request(`/v1/runtimes/${id}/exec`, {
      method: "POST",
      headers: bob,
      body: JSON.stringify({ command: ["ls"] }),
    });
    expect(exec.status).toBe(404);

    const execPaid = await cloud.app.request(`/v1/runtimes/${id}/exec`, {
      method: "POST",
      headers: { ...bob, "PAYMENT-SIGNATURE": x402Credential({ nonce: "n-bob", amountUsd: 1 }) },
      body: JSON.stringify({ prompt: "steal" }),
    });
    expect([402, 404]).toContain(execPaid.status);
    expect(execPaid.status).toBe(404);

    const snapshot = await cloud.app.request(`/v1/runtimes/${id}/snapshot`, {
      method: "POST",
      headers: bob,
      body: JSON.stringify({}),
    });
    expect(snapshot.status).toBe(404);

    const memory = await cloud.app.request(`/v1/memory/${id}/status`, { headers: bob });
    expect(memory.status).toBe(404);

    const events = await cloud.app.request(`/v1/runtimes/${id}/events`, { headers: bob });
    expect(events.status).toBe(404);
  });

  it("unauthenticated requests are rejected", async () => {
    const cloud = createTestCloud({ adapter });
    const res = await cloud.app.request("/v1/runtimes");
    expect(res.status).toBe(401);
  });

  it("a stranger cannot read another principal's ledger or balance", async () => {
    const cloud = createTestCloud({ adapter });
    await makeRuntime(cloud);
    const ledger = await cloud.app.request("/v1/meter/ledger?principalId=wallet:0xalice", {
      headers: { authorization: "Bearer token-bob" },
    });
    expect(ledger.status).toBe(200);
    const rows = (await ledger.json()) as Array<{ principalId: string }>;
    expect(rows).toHaveLength(0);
  });
});
