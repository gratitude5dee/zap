// Convex + cloud opt-in state carries metadata only: no join credential, no
// control-plane URL, no message content (C1/C6/C24).
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCloudApp } from "../packages/cloud/src/app";
import type { RuntimeRow, RuntimeStore } from "../packages/cloud/src/types";
import { requireServiceToken } from "../convex/lib/serviceAuth";
import {
  setOptIn as setOptInFunction,
  recordStatus as recordStatusFunction,
} from "../convex/runtimeConnectivity";

const repoRoot = path.resolve(import.meta.dirname, "..");
const originalToken = process.env.ZAP_CONVEX_SERVICE_TOKEN;

afterEach(() => {
  if (originalToken === undefined) delete process.env.ZAP_CONVEX_SERVICE_TOKEN;
  else process.env.ZAP_CONVEX_SERVICE_TOKEN = originalToken;
});

describe("convex runtimeConnectivity stores metadata only", () => {
  const schema = readFileSync(path.join(repoRoot, "convex/schema.ts"), "utf8");
  const module = readFileSync(path.join(repoRoot, "convex/runtimeConnectivity.ts"), "utf8");

  it("declares booleans, coarse statuses, and timestamps — no credential fields", () => {
    const table = schema.slice(schema.indexOf("runtimeConnectivity: defineTable"));
    const body = table.slice(0, table.indexOf("\n  })"));
    expect(body).toContain("tailscaleEnabled: v.boolean()");
    expect(body).toContain("samMeshEnabled: v.boolean()");
    expect(body).toContain("x402Enabled: v.boolean()");
    for (const forbidden of ["token", "authKey", "auth_key", "credential", "url", "prompt", "content", "message"]) {
      expect(body.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("every query and mutation requires the service token", () => {
    const guards = module.match(/requireServiceToken\(args\.serviceToken\)/g) ?? [];
    const functions = module.match(/=\s*(query|mutation)\(/g) ?? [];
    expect(functions.length).toBeGreaterThanOrEqual(4);
    expect(guards.length).toBe(functions.length);
  });

  it("rejects a wrong service token before touching the database", async () => {
    process.env.ZAP_CONVEX_SERVICE_TOKEN = "expected";
    expect(() => requireServiceToken("wrong")).toThrow(/unauthorized/i);
    const db = {
      insert: () => {
        throw new Error("must not write");
      },
      patch: () => {
        throw new Error("must not write");
      },
      query: () => {
        throw new Error("must not read");
      },
    };
    for (const fn of [setOptInFunction, recordStatusFunction]) {
      const handler = (fn as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler;
      await expect(
        handler({ db }, {
          authorId: "user",
          enabled: true,
          feature: "samMesh",
          runtimeId: "rt_1",
          serviceToken: "wrong",
          status: "running",
        }),
      ).rejects.toThrow(/unauthorized/i);
    }
  });

  it("the store wrapper exposes no field for a credential", () => {
    const store = readFileSync(path.join(repoRoot, "lib/runtime-connectivity-store.ts"), "utf8");
    const record = store
      .slice(store.indexOf("export type RuntimeConnectivityRecord"), store.indexOf("const getByRuntime"))
      .toLowerCase();
    for (const forbidden of ["token", "controlplane", "authkey", "prompt", "content"]) {
      expect(record).not.toContain(forbidden);
    }
  });
});

describe("cloud connectivity opt-in", () => {
  function runtimeRow(): RuntimeRow {
    return {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "rt_1",
      provider: "fake",
      providerId: "box_1",
      runtimeToken: "rt_secret_token",
      state: "running",
      stopAfter: null,
      tenantId: "user_1",
      weight: "light",
    };
  }

  function store(initial: RuntimeRow): RuntimeStore & { row: RuntimeRow } {
    const state: { row: RuntimeRow } = { row: { ...initial } };
    return {
      async all() {
        return [state.row];
      },
      async byToken(token: string) {
        return state.row.runtimeToken === token ? state.row : null;
      },
      async get(id: string) {
        return state.row.id === id ? state.row : null;
      },
      async insert(row: RuntimeRow) {
        state.row = { ...row };
      },
      async list(tenantId: string) {
        return state.row.tenantId === tenantId ? [state.row] : [];
      },
      get row() {
        return state.row;
      },
      async update(id: string, patch: Partial<RuntimeRow>) {
        if (state.row.id === id) state.row = { ...state.row, ...patch };
      },
    };
  }

  it("normalizes an opt-in payload to booleans and drops unknown keys", async () => {
    const runtimes = store(runtimeRow());
    const app = createCloudApp({
      runtimes,
      sandbox: { create: async () => ({ id: "box_1" }) },
    } as unknown as Parameters<typeof createCloudApp>[0]);

    const response = await app.request("/v1/runtimes/rt_1/connectivity", {
      body: JSON.stringify({
        connectivity: { bootstrapToken: "bt-canary-000", samMesh: true, tailscale: "yes" },
      }),
      headers: { Authorization: "Bearer user_1", "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { connectivity: Record<string, unknown> };
    expect(body.connectivity).toEqual({
      cotal: false,
      samMesh: true,
      tailscale: false,
      taskrouter: false,
      x402: false,
    });
    expect(JSON.stringify(body)).not.toContain("bt-canary-000");
    expect(JSON.stringify(runtimes.row.connectivity)).not.toContain("bt-canary-000");
  });

  it("refuses a runtime the caller does not own", async () => {
    const runtimes = store(runtimeRow());
    const app = createCloudApp({
      runtimes,
      sandbox: { create: async () => ({ id: "box_1" }) },
    } as unknown as Parameters<typeof createCloudApp>[0]);
    const response = await app.request("/v1/runtimes/rt_1/connectivity", {
      headers: { Authorization: "Bearer intruder" },
    });
    expect(response.status).toBe(404);
  });
});
