import { Hono } from "hono";
import { createGate, gatePriceUsd } from "./gate.ts";
import { mountGateway } from "./gateway.ts";
import { sweepRuntimes } from "./sweep.ts";
import type {
  CloudDeps,
  CloudHono,
  CloudMiddleware,
  CloudRouteModule,
  RuntimeRow,
} from "./types.ts";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

export interface CreateCloudAppOptions {
  modules?: CloudRouteModule[];
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function bearerToken(header: string | undefined): string | undefined {
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
}

/**
 * The Zap cloud control API as a Hono app. Storage, payments, rate limits,
 * and the sandbox provider are injected via {@link CloudDeps}; sibling route
 * modules mount through {@link CloudRouteModule} without editing these files.
 */
export function createCloudApp(deps: CloudDeps, options: CreateCloudAppOptions = {}): CloudHono {
  const app: CloudHono = new Hono();
  const gate = createGate(deps);
  const now = deps.now ?? (() => new Date());

  app.use("*", async (c, next) => {
    const token = bearerToken(c.req.header("authorization")) ?? c.req.header("x-zap-principal");
    if (token) c.set("principal", token);
    await next();
  });

  const requireAuth: CloudMiddleware = async (c, next) => {
    if (!c.get("principal")) {
      return c.json({ error: { code: "UNAUTHENTICATED", message: "Send a bearer token." } }, 401);
    }
    await next();
  };

  const ownRuntime: CloudMiddleware = async (c, next) => {
    const principal = c.get("principal");
    if (!principal) {
      return c.json({ error: { code: "UNAUTHENTICATED", message: "Send a bearer token." } }, 401);
    }
    const row = await deps.runtimes.get(c.req.param("id") ?? "");
    if (!row || row.tenantId !== principal) {
      return c.json({ error: { code: "RUNTIME_NOT_FOUND", message: "No such runtime." } }, 404);
    }
    await next();
  };

  app.get("/v1/health", (c) => c.json({ ok: true }));

  app.post("/v1/runtimes", requireAuth, async (c) => {
    const principal = c.get("principal") ?? "";
    const perHour = deps.limits?.runtimesPerHour;
    if (perHour !== undefined) {
      const allowed = await deps.limiter.hit(`runtimes:${principal}`, perHour, HOUR_MS);
      if (!allowed) {
        return c.json({ error: { code: "RATE_LIMITED", message: "Runtime creation limit reached." } }, 429);
      }
    }
    const body = (await c.req.json().catch(() => ({}))) as { weight?: RuntimeRow["weight"]; provider?: string };
    await deps.sandbox.create({ weight: body.weight ?? "light", noEnv: true });
    const row: RuntimeRow = {
      id: newId("rt"),
      tenantId: principal,
      weight: body.weight ?? "light",
      provider: body.provider ?? "box",
      state: "ready",
      createdAt: now().toISOString(),
      stopAfter: new Date(now().getTime() + 30 * MINUTE_MS).toISOString(),
      runtimeToken: newId("rtk"),
    };
    await deps.runtimes.insert(row);
    await deps.counters.bump("starts");
    return c.json({ id: row.id, state: row.state, runtimeToken: row.runtimeToken });
  });

  app.get("/v1/runtimes", requireAuth, async (c) => {
    const rows = await deps.runtimes.list(c.get("principal") ?? "");
    return c.json(rows.map(({ runtimeToken: _token, ...row }) => row));
  });

  app.post("/v1/runtimes/:id/up", ownRuntime, async (c) => {
    await deps.runtimes.update(c.req.param("id"), { state: "ready" });
    return c.json({ ok: true });
  });

  app.post("/v1/runtimes/:id/down", ownRuntime, async (c) => {
    await deps.sandbox.stop({ id: c.req.param("id") });
    await deps.runtimes.update(c.req.param("id"), { state: "stopped", stopAfter: null });
    return c.json({ ok: true });
  });

  const gateIfPrompt: CloudMiddleware = async (c, next) => {
    const body = (await c.req.json().catch(() => ({}))) as { prompt?: string };
    if (body.prompt !== undefined) return gate(c, next);
    return next();
  };

  const execLimit: CloudMiddleware = async (c, next) => {
    const perMinute = deps.limits?.execPerMinute;
    if (perMinute !== undefined) {
      const allowed = await deps.limiter.hit(`exec:${c.req.param("id") ?? ""}`, perMinute, MINUTE_MS);
      if (!allowed) {
        return c.json({ error: { code: "RATE_LIMITED", message: "Exec limit reached." } }, 429);
      }
    }
    await next();
  };

  app.post("/v1/runtimes/:id/exec", ownRuntime, execLimit, gateIfPrompt, async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      command?: string[];
      prompt?: string;
      live?: boolean;
    };
    if (body.command) {
      const result = await deps.sandbox.exec(id, body.command);
      return c.json({ stdout: result.stdout, exitCode: result.exitCode });
    }
    if (body.prompt !== undefined) {
      return c.json({
        runId: newId("run"),
        live: body.live ?? false,
        receiptId: c.get("receipt")?.id ?? null,
      });
    }
    return c.json({ error: { code: "BAD_REQUEST", message: "Send a command or a prompt." } }, 400);
  });

  app.post("/v1/runtimes/:id/snapshot", ownRuntime, async (c) => {
    const result = await deps.sandbox.snapshot(c.req.param("id"));
    return c.json(result);
  });

  app.post("/v1/runtimes/:id/fork", ownRuntime, gate, async (c) => {
    const id = c.req.param("id");
    const forked = await deps.sandbox.fork(id, { source: id, noEnv: true });
    return c.json({ id: forked.providerId, receiptId: c.get("receipt")?.id ?? null });
  });

  app.get("/v1/runtimes/:id/events", ownRuntime, async (c) => {
    return c.json([] as Array<{ type: string; at: string }>);
  });

  app.get("/v1/memory/:id/status", ownRuntime, (c) => c.json({ status: "ok" }));

  app.post("/v1/memory/:id/forget", ownRuntime, (c) => c.json({ ok: true }));

  app.post("/v1/memory/:id/export", ownRuntime, (c) => c.json({ ok: true, url: null }));

  app.post("/v1/pay/quote", requireAuth, (c) => c.json({ usd: gatePriceUsd(deps) }));

  app.get("/v1/meter/ledger", requireAuth, async (c) => {
    const principal = c.get("principal") ?? "";
    return c.json(await deps.meter.ledger(`tenant:${principal}`));
  });

  app.get("/v1/meter/balance", requireAuth, async (c) => {
    const principal = c.get("principal") ?? "";
    return c.json({ usd: await deps.meter.balance(`tenant:${principal}`) });
  });

  app.get("/v1/templates", (c) => c.json([] as Array<{ id: string }>));

  app.post("/v1/templates/:name/publish", requireAuth, (c) =>
    c.json({ error: { code: "NOT_IMPLEMENTED", message: "Template publishing lands with the registry store." } }, 501),
  );

  app.get("/v1/sweep", async (c) => {
    const secret = deps.env.ZAP_CRON_SECRET;
    if (!secret || bearerToken(c.req.header("authorization")) !== secret) {
      return c.json({ error: { code: "UNAUTHENTICATED", message: "Cron secret required." } }, 401);
    }
    const result = await sweepRuntimes(deps, now());
    return c.json(result);
  });

  app.get("/v1/admin/ops", async (c) => {
    const adminToken = deps.env.ZAP_ADMIN_TOKEN;
    if (!adminToken || bearerToken(c.req.header("authorization")) !== adminToken) {
      return c.json({ error: { code: "UNAUTHENTICATED", message: "Admin token required." } }, 401);
    }
    const counters = await deps.counters.read();
    const runtimesByState: Record<string, number> = {};
    for (const row of await deps.runtimes.all()) {
      runtimesByState[row.state] = (runtimesByState[row.state] ?? 0) + 1;
    }
    const receipts = await deps.receipts.list();
    const today = now().toISOString().slice(0, 10);
    const todays = receipts.filter((r) => r.at.startsWith(today));
    return c.json({
      startsLastHour: await deps.counters.startsSince(now().getTime() - HOUR_MS),
      runtimesByState,
      settlesToday: {
        count: todays.length,
        usd: todays.reduce((sum, r) => sum + r.amountUsd, 0),
      },
      startLimitReached: counters.startLimitReached ?? 0,
      sweeperStops: counters.sweeperStops ?? 0,
      gateRejections: counters.gateRejections ?? 0,
    });
  });

  mountGateway(app, deps);

  for (const module of options.modules ?? []) {
    module.mount(app, { gate, deps });
  }

  return app;
}
