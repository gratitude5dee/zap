// @ts-check
// zap memory status|search <q>|export|forget <uri> — over the MemoryService
// contract. Registered by the CLI dispatcher's command-registration
// convention (packages/cli/src/commands/<domain>/, auto-discovered).
// Content stays on the VM: this command talks to the loopback OpenViking
// server (or an injected service in tests) and never prints secrets.

export const name = "memory";

export const help = `zap memory <subcommand>

  status              memory provider health and item counts
  search <query>      search tenant memory (in-VM / self-host only)
  remember <text>     store a memory item (in-VM / self-host only)
  export              stream every memory item (I6 extraction path)
  forget <uri>        remove one memory item

Flags:
  --json              machine-readable output
  --ephemeral         remember: session-scoped, not durable (requires --session)
  --tenant <id>       tenant scope (default "self")
  --runtime <id>      runtime scope (default "local")
  --session <id>      session scope
  --limit <n>         search result limit`;

export const jsonSchema = {
  status: { healthy: "boolean", items: "number", provider: "string", locality: "string" },
  search: { query: "string", results: "MemoryItem[]" },
  remember: { ok: "boolean", uri: "string", durable: "boolean" },
  export: { items: "MemoryItem[]" },
  forget: { ok: "boolean", uri: "string" },
};

/**
 * @param {string[]} args
 * @param {Record<string, string | boolean>} flags
 * @param {{ service?: import("@wzrdtech/zap-memory").MemoryService }} [deps]
 */
export async function run(args, flags, deps = {}) {
  const service = deps.service ?? (await defaultService());
  const scope = {
    tenantId: typeof flags.tenant === "string" ? flags.tenant : "self",
    runtimeId: typeof flags.runtime === "string" ? flags.runtime : "local",
    ...(typeof flags.session === "string" ? { sessionId: flags.session } : {}),
  };
  const json = flags.json === true;
  const subcommand = args[0];

  switch (subcommand) {
    case "status": {
      const status = await service.status();
      const payload = { ...status, provider: service.provider, locality: service.locality };
      print(payload, json, (p) => `${p.provider} (${p.locality}): ${p.healthy ? "healthy" : "unhealthy"}, ${p.items} items`);
      return 0;
    }
    case "search": {
      const query = args.slice(1).join(" ").trim();
      if (query === "") throw new Error("zap memory search requires a query");
      const limit = typeof flags.limit === "string" ? Number(flags.limit) : undefined;
      const results = await service.search(scope, query, limit !== undefined ? { limit } : undefined);
      print({ query, results }, json, (p) => p.results.map((r) => `${r.uri}\t${r.text ?? ""}`).join("\n"));
      return 0;
    }
    case "remember": {
      const text = args.slice(1).join(" ").trim();
      if (text === "") throw new Error("zap memory remember requires text");
      const durable = flags.ephemeral !== true;
      if (!durable && scope.sessionId === undefined) {
        throw new Error("zap memory remember --ephemeral requires --session <id> (non-durable memory is session-scoped)");
      }
      const item = await service.remember(scope, { durable, text });
      print({ durable, ok: true, uri: item.uri }, json, (p) => `remembered ${p.uri}${p.durable ? "" : " (ephemeral)"}`);
      return 0;
    }
    case "export": {
      const items = [];
      for await (const item of await service.export(scope)) items.push(item);
      print({ items }, json, (p) => p.items.map((i) => i.uri).join("\n"));
      return 0;
    }
    case "forget": {
      const uri = args[1];
      if (uri === undefined) throw new Error("zap memory forget requires a uri");
      await service.forget(scope, uri);
      print({ ok: true, uri }, json, (p) => `forgot ${p.uri}`);
      return 0;
    }
    default:
      throw new Error(`Unknown memory subcommand "${subcommand ?? ""}". Run zap memory --help.`);
  }
}

async function defaultService() {
  const { createOpenVikingMemory } = await import("@wzrdtech/zap-memory");
  return createOpenVikingMemory();
}

/**
 * @template T
 * @param {T} payload
 * @param {boolean} json
 * @param {(payload: T) => string} human
 */
function print(payload, json, human) {
  console.log(json ? JSON.stringify(payload, null, 2) : human(payload));
}
