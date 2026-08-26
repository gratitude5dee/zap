// Managed secret resolution (§5.12): POST /v1/runtimes/:id/secrets/resolve,
// authenticated by the runtime's own token. The value is returned for one
// request and never traced, logged, or stored on the response path.
import type { CloudRouteModule } from "../types.ts";

export interface TenantSecretRecord {
  value: string;
  /** optional allowlist; omitted fields match anything */
  scope?: { agentId?: string; alias?: string; connectionId?: string; origin?: string };
}

export interface TenantSecretStore {
  get(tenantId: string, name: string): Promise<TenantSecretRecord | null>;
  set(tenantId: string, name: string, record: TenantSecretRecord): Promise<void>;
  names(tenantId: string): Promise<string[]>;
  remove(tenantId: string, name: string): Promise<void>;
}

export function memoryTenantSecretStore(): TenantSecretStore {
  const byTenant = new Map<string, Map<string, TenantSecretRecord>>();
  const bucket = (tenantId: string): Map<string, TenantSecretRecord> => {
    let map = byTenant.get(tenantId);
    if (!map) {
      map = new Map();
      byTenant.set(tenantId, map);
    }
    return map;
  };
  return {
    async get(tenantId, name) {
      return bucket(tenantId).get(name) ?? null;
    },
    async set(tenantId, name, record) {
      bucket(tenantId).set(name, record);
    },
    async names(tenantId) {
      return [...bucket(tenantId).keys()].sort();
    },
    async remove(tenantId, name) {
      bucket(tenantId).delete(name);
    },
  };
}

interface ResolveBody {
  kind?: "secret" | "gateway";
  name?: string;
  scope?: {
    project?: string;
    agentId?: string;
    alias?: string;
    connectionId?: string;
    origin?: string;
    method?: string;
    path?: string;
  };
}

function scopeMatches(record: TenantSecretRecord, scope: ResolveBody["scope"]): boolean {
  const allow = record.scope;
  if (!allow) return true;
  if (allow.agentId !== undefined && allow.agentId !== scope?.agentId) return false;
  if (allow.alias !== undefined && allow.alias !== scope?.alias) return false;
  if (allow.connectionId !== undefined && allow.connectionId !== scope?.connectionId) return false;
  if (allow.origin !== undefined && allow.origin !== scope?.origin) return false;
  return true;
}

export function createSecretsResolveModule(options: { store: TenantSecretStore }): CloudRouteModule {
  return {
    name: "secrets-resolve",
    mount(app, { deps }) {
      app.post("/v1/runtimes/:id/secrets/resolve", async (c) => {
        const header = c.req.header("authorization");
        const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
        const runtime = token ? await deps.runtimes.byToken(token) : null;
        if (!runtime || runtime.id !== c.req.param("id")) {
          return c.json({ error: { code: "UNAUTHENTICATED", message: "Send the runtime token." } }, 401);
        }
        const body = (await c.req.json().catch(() => ({}))) as ResolveBody;
        if (body.kind === "gateway") {
          return c.json({ error: { code: "GATEWAY_KEY_UNAVAILABLE", message: "No managed gateway key." } }, 404);
        }
        if (!body.name) {
          return c.json({ error: { code: "BAD_REQUEST", message: "Send a secret name." } }, 400);
        }
        const record = await options.store.get(runtime.tenantId, body.name);
        if (!record) {
          return c.json({ error: { code: "SECRET_UNAVAILABLE", message: `secret ${body.name} is not set.` } }, 404);
        }
        if (!scopeMatches(record, body.scope)) {
          return c.json({ error: { code: "SECRET_SCOPE_DENIED", message: "Scope denied." } }, 403);
        }
        return c.json({ value: record.value });
      });
    },
  };
}
