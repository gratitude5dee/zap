import { describe, expect, it } from "vitest";
import { createTestCloud, x402Credential, type TestCloud } from "../src/testing.ts";

const ADAPTERS = ["vercel", "cloudflare"] as const;

async function makeRuntime(cloud: TestCloud): Promise<{ id: string; runtimeToken: string }> {
  const res = await cloud.app.request("/v1/runtimes", {
    method: "POST",
    headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
    body: JSON.stringify({ weight: "med", provider: "box" }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { id: string; runtimeToken: string };
}

describe.each(ADAPTERS)("managed gateway proxy (%s adapter)", (adapter) => {
  it("rejects a missing RUNTIME_TOKEN", async () => {
    const cloud = createTestCloud({ adapter });
    const { id } = await makeRuntime(cloud);
    const res = await cloud.app.request(`/v1/runtimes/${id}/gateway/llm/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "test/model", messages: [] }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a foreign RUNTIME_TOKEN", async () => {
    const cloud = createTestCloud({ adapter });
    const { id } = await makeRuntime(cloud);
    const other = await makeRuntime(cloud);
    const res = await cloud.app.request(`/v1/runtimes/${id}/gateway/llm/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-runtime-token": other.runtimeToken,
      },
      body: JSON.stringify({ model: "test/model", messages: [] }),
    });
    expect(res.status).toBe(403);
  });

  it("proxies completions, meters tokens against the reservation, and strips provider key headers", async () => {
    const cloud = createTestCloud({ adapter });
    const { id, runtimeToken } = await makeRuntime(cloud);
    const res = await cloud.app.request(`/v1/runtimes/${id}/gateway/llm/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-runtime-token": runtimeToken },
      body: JSON.stringify({ model: "test/model", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-api-key")).toBeNull();
    expect(res.headers.get("authorization")).toBeNull();
    const body = (await res.json()) as { usage: { prompt_tokens: number } };
    expect(body.usage.prompt_tokens).toBeGreaterThan(0);
    const metered = cloud.meterLines.filter((line) => line.unit.startsWith("gateway_"));
    expect(metered.length).toBeGreaterThanOrEqual(2);
  });

  it("streams SSE from the upstream", async () => {
    const cloud = createTestCloud({ adapter });
    const { id, runtimeToken } = await makeRuntime(cloud);
    const res = await cloud.app.request(`/v1/runtimes/${id}/gateway/llm/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-runtime-token": runtimeToken },
      body: JSON.stringify({ model: "test/model", messages: [], stream: true }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    const text = await res.text();
    expect(text).toContain("data:");
    expect(text).toContain("[DONE]");
  });

  it("meters media requests on submit", async () => {
    const cloud = createTestCloud({ adapter });
    const { id, runtimeToken } = await makeRuntime(cloud);
    const res = await cloud.app.request(`/v1/runtimes/${id}/gateway/media/fal/submit`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-runtime-token": runtimeToken },
      body: JSON.stringify({ model: "fal-ai/flux/dev", input: { prompt: "a cat" } }),
    });
    expect(res.status).toBe(200);
    expect(cloud.meterLines.some((line) => line.unit === "media_request")).toBe(true);
  });

  it("a managed runtime fork body contains no provider keys", async () => {
    const cloud = createTestCloud({ adapter });
    const { id } = await makeRuntime(cloud);
    const res = await cloud.app.request(`/v1/runtimes/${id}/fork`, {
      method: "POST",
      headers: {
        authorization: "Bearer token-alice",
        "content-type": "application/json",
        "PAYMENT-SIGNATURE": x402Credential({ nonce: "nonce-fork", amountUsd: 1 }),
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const forkBodies = cloud.sandbox.forkBodies;
    expect(forkBodies).toHaveLength(1);
    const serialized = JSON.stringify(forkBodies[0]);
    expect(serialized).not.toMatch(/OPENROUTER_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-/);
    expect((forkBodies[0] as { noEnv?: boolean }).noEnv).toBe(true);
  });
});
