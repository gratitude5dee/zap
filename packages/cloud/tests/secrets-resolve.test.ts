// POST /v1/runtimes/:id/secrets/resolve: runtime-token auth, tenant isolation,
// scope denial before value release, and no value leakage on error paths.
import { describe, expect, it } from "vitest";
import { createSecretsResolveModule, memoryTenantSecretStore } from "../src/secrets/resolve.ts";
import { createTestCloud, type TestCloud } from "../src/testing.ts";

const CANARY = "canary-managed-secret-1a2b3c";

async function makeFixture(): Promise<{ cloud: TestCloud; runtimeId: string; token: string }> {
  const store = memoryTenantSecretStore();
  await store.set("token-alice", "WEBHOOK_TOKEN", {
    value: CANARY,
    scope: { agentId: "transcode", connectionId: "webhook" },
  });
  const cloud = createTestCloud({ adapter: "vercel", modules: [createSecretsResolveModule({ store })] });
  const res = await cloud.app.request("/v1/runtimes", {
    method: "POST",
    headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
    body: JSON.stringify({ weight: "light" }),
  });
  const body = (await res.json()) as { id: string; runtimeToken: string };
  return { cloud, runtimeId: body.id, token: body.runtimeToken };
}

function resolve(
  cloud: TestCloud,
  runtimeId: string,
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return Promise.resolve(
    cloud.app.request(`/v1/runtimes/${runtimeId}/secrets/resolve`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const okScope = {
  project: "zap",
  agentId: "transcode",
  alias: "development",
  connectionId: "webhook",
  origin: "https://hooks.example.com",
  method: "POST",
  path: "/zap/done",
};

describe("cloud secrets resolve", () => {
  it("resolves a scoped secret for the runtime's own token", async () => {
    const { cloud, runtimeId, token } = await makeFixture();
    const res = await resolve(cloud, runtimeId, token, { kind: "secret", name: "WEBHOOK_TOKEN", scope: okScope });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { value: string }).value).toBe(CANARY);
  });

  it("rejects a tenant bearer token and mismatched runtime ids", async () => {
    const { cloud, runtimeId, token } = await makeFixture();
    const tenantToken = await resolve(cloud, runtimeId, "token-alice", {
      kind: "secret",
      name: "WEBHOOK_TOKEN",
      scope: okScope,
    });
    expect(tenantToken.status).toBe(401);
    expect(JSON.stringify(await tenantToken.json())).not.toContain(CANARY);

    const wrongId = await resolve(cloud, "rt_other", token, { kind: "secret", name: "WEBHOOK_TOKEN", scope: okScope });
    expect(wrongId.status).toBe(401);
  });

  it("denies an out-of-scope request with 403 and no value", async () => {
    const { cloud, runtimeId, token } = await makeFixture();
    const res = await resolve(cloud, runtimeId, token, {
      kind: "secret",
      name: "WEBHOOK_TOKEN",
      scope: { ...okScope, agentId: "researcher" },
    });
    expect(res.status).toBe(403);
    const payload = JSON.stringify(await res.json());
    expect(payload).toContain("SECRET_SCOPE_DENIED");
    expect(payload).not.toContain(CANARY);
  });

  it("returns SECRET_UNAVAILABLE for unknown names without leaking values", async () => {
    const { cloud, runtimeId, token } = await makeFixture();
    const res = await resolve(cloud, runtimeId, token, { kind: "secret", name: "MISSING", scope: okScope });
    expect(res.status).toBe(404);
    const payload = JSON.stringify(await res.json());
    expect(payload).toContain("SECRET_UNAVAILABLE");
    expect(payload).not.toContain(CANARY);
  });
});
