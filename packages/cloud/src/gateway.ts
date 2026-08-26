import type { MeterUnit } from "@wzrdtech/core";
import type { CloudDeps, CloudHono, RuntimeRow } from "./types.ts";

const STRIPPED_HEADERS = ["x-api-key", "authorization", "x-goog-api-key", "openai-api-key"];

async function authRuntime(
  deps: CloudDeps,
  id: string,
  token: string | undefined,
): Promise<{ status: 200; runtime: RuntimeRow } | { status: 401 | 403 }> {
  if (!token) return { status: 401 };
  const runtime = await deps.runtimes.byToken(token);
  if (!runtime || runtime.id !== id) return { status: 403 };
  return { status: 200, runtime };
}

function sanitized(upstream: Response): Response {
  const headers = new Headers(upstream.headers);
  for (const name of STRIPPED_HEADERS) headers.delete(name);
  return new Response(upstream.body, { status: upstream.status, headers });
}

async function meterTokens(
  deps: CloudDeps,
  runtime: RuntimeRow,
  usage: { prompt_tokens?: number; completion_tokens?: number },
): Promise<void> {
  const at = (deps.now ?? (() => new Date()))().toISOString();
  const lines: Array<{ unit: MeterUnit; qty: number }> = [
    { unit: "gateway_input_token", qty: usage.prompt_tokens ?? 0 },
    { unit: "gateway_output_token", qty: usage.completion_tokens ?? 0 },
  ];
  for (const line of lines) {
    if (line.qty <= 0) continue;
    await deps.meter.settle({
      unit: line.unit,
      qty: line.qty,
      usd: 0,
      sku: `gateway.${line.unit}`,
      principalId: `tenant:${runtime.tenantId}`,
      runId: null,
      runtimeId: runtime.id,
      at,
    });
  }
}

/**
 * Managed gateway proxy: in-VM callers authenticate with their RUNTIME_TOKEN,
 * requests are proxied to the pooled provider upstream, token usage is
 * metered, and provider-key headers are never returned.
 */
export function mountGateway(app: CloudHono, deps: CloudDeps): void {
  const llmPaths = ["chat/completions", "responses", "messages"] as const;
  for (const path of llmPaths) {
    app.post(`/v1/runtimes/:id/gateway/llm/v1/${path}`, async (c) => {
      const auth = await authRuntime(deps, c.req.param("id"), c.req.header("x-runtime-token"));
      if (auth.status !== 200) {
        return c.json({ error: { code: "RUNTIME_TOKEN_INVALID", message: "Invalid runtime token." } }, auth.status);
      }
      const body = (await c.req.json()) as Record<string, unknown>;
      const upstream = await deps.upstream.llm(path, body);
      const contentType = upstream.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream")) {
        return sanitized(upstream);
      }
      const clone = upstream.clone();
      try {
        const parsed = (await clone.json()) as { usage?: { prompt_tokens?: number; completion_tokens?: number } };
        if (parsed.usage) await meterTokens(deps, auth.runtime, parsed.usage);
      } catch {
        // non-JSON upstream body: nothing to meter
      }
      return sanitized(upstream);
    });
  }

  for (const kind of ["submit", "poll"] as const) {
    app.post(`/v1/runtimes/:id/gateway/media/:provider/${kind}`, async (c) => {
      const auth = await authRuntime(deps, c.req.param("id"), c.req.header("x-runtime-token"));
      if (auth.status !== 200) {
        return c.json({ error: { code: "RUNTIME_TOKEN_INVALID", message: "Invalid runtime token." } }, auth.status);
      }
      const body = (await c.req.json()) as Record<string, unknown>;
      const upstream = await deps.upstream.media(c.req.param("provider"), kind, body);
      if (kind === "submit" && upstream.ok) {
        await deps.meter.settle({
          unit: "media_request",
          qty: 1,
          usd: 0,
          sku: `media.${c.req.param("provider")}`,
          principalId: `tenant:${auth.runtime.tenantId}`,
          runId: null,
          runtimeId: auth.runtime.id,
          at: (deps.now ?? (() => new Date()))().toISOString(),
        });
      }
      return sanitized(upstream);
    });
  }
}
