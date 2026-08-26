// Connections: allowlisted egress checked before any header is attached (C15).
import { describe, expect, it } from "vitest";
import {
  bearer,
  createConnectionFetch,
  defineConnection,
  useSecret,
  type SecretRef,
  type SecretScope,
} from "../src/index.ts";

const webhook = defineConnection({
  id: "webhook",
  origin: "https://hooks.example.com",
  methods: ["POST"],
  pathPrefix: "/zap/",
  headers: { Authorization: bearer(useSecret("WEBHOOK_TOKEN")) },
});

const scope = { project: "zap", agentId: "transcode", alias: "development" };

function makeResolver(values: Record<string, string>, allowed: { agentId: string; alias: string }) {
  const lookups: string[] = [];
  const resolve = async (ref: SecretRef, fullScope: SecretScope): Promise<string> => {
    if (fullScope.agentId !== allowed.agentId || fullScope.alias !== allowed.alias) {
      const error = new Error(`secret ${ref.name} out of scope`) as Error & { code: string };
      error.code = "SECRET_SCOPE_DENIED";
      throw error;
    }
    lookups.push(ref.name);
    const value = values[ref.name];
    if (value === undefined) throw new Error("missing");
    return value;
  };
  return { resolve, lookups };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code ?? "";
  }
  return "";
}

describe("connection fetch", () => {
  it("rejects absolute URLs with CONNECTION_ABSOLUTE_URL before any lookup", async () => {
    const resolver = makeResolver({ WEBHOOK_TOKEN: "canary-tok" }, scope);
    const conn = createConnectionFetch(webhook.definition, {
      scope,
      resolveSecret: resolver.resolve,
      fetchImpl: async () => new Response("ok"),
    });
    expect(await codeOf(conn.fetch("https://evil.example/x"))).toBe("CONNECTION_ABSOLUTE_URL");
    expect(resolver.lookups).toEqual([]);
  });

  it("rejects methods outside the allowlist with CONNECTION_METHOD_DENIED", async () => {
    const resolver = makeResolver({ WEBHOOK_TOKEN: "canary-tok" }, scope);
    const conn = createConnectionFetch(webhook.definition, {
      scope,
      resolveSecret: resolver.resolve,
      fetchImpl: async () => new Response("ok"),
    });
    expect(await codeOf(conn.fetch("/zap/ok", { method: "DELETE" }))).toBe("CONNECTION_METHOD_DENIED");
    expect(resolver.lookups).toEqual([]);
  });

  it("rejects paths outside pathPrefix with CONNECTION_PATH_DENIED, including .. escapes", async () => {
    const resolver = makeResolver({ WEBHOOK_TOKEN: "canary-tok" }, scope);
    const conn = createConnectionFetch(webhook.definition, {
      scope,
      resolveSecret: resolver.resolve,
      fetchImpl: async () => new Response("ok"),
    });
    expect(await codeOf(conn.fetch("/other/path", { method: "POST" }))).toBe("CONNECTION_PATH_DENIED");
    expect(await codeOf(conn.fetch("/zap/../other", { method: "POST" }))).toBe("CONNECTION_PATH_DENIED");
    expect(resolver.lookups).toEqual([]);
  });

  it("denies a mismatched (agentId, alias) scope with SECRET_SCOPE_DENIED before any lookup", async () => {
    const resolver = makeResolver({ WEBHOOK_TOKEN: "canary-tok" }, { agentId: "other", alias: "production" });
    const conn = createConnectionFetch(webhook.definition, {
      scope,
      resolveSecret: resolver.resolve,
      fetchImpl: async () => new Response("ok"),
    });
    expect(await codeOf(conn.fetch("/zap/ping", { method: "POST" }))).toBe("SECRET_SCOPE_DENIED");
    expect(resolver.lookups).toEqual([]);
  });

  it("attaches the resolved header to a declared POST /zap/ping and discards it", async () => {
    const resolver = makeResolver({ WEBHOOK_TOKEN: "canary-tok" }, scope);
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const conn = createConnectionFetch(webhook.definition, {
      scope,
      resolveSecret: resolver.resolve,
      fetchImpl: async (url, init) => {
        seen.push({ url, headers: { ...(init?.headers as Record<string, string>) } });
        return new Response("ok", { status: 200 });
      },
    });
    const response = await conn.fetch("/zap/ping", { method: "POST", body: "{}" });
    expect(response.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://hooks.example.com/zap/ping");
    expect(seen[0]?.headers.Authorization).toBe("Bearer canary-tok");
    expect(resolver.lookups).toEqual(["WEBHOOK_TOKEN"]);
    expect(JSON.stringify(conn)).not.toContain("canary-tok");
  });
});
