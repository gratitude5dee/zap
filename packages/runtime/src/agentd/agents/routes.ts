// zap-agentd /v1/agents routes (§5.12): deployments, aliases, sessions, and
// SSE turns over the agent host. Mounted only when --serve-agents is set.
import type { AgentEvent } from "@wzrdtech/zap-agent";
import type { Context } from "@wzrdtech/zap-kernel";
import type { EnvSecretResolver } from "../../secrets/env.ts";
import type { AgentdRequest, AgentdResponse, AgentdRouteModule } from "../routes.ts";
import { AgentHostError, type AgentHost } from "./host.ts";
import type { RegisterDeploymentInput } from "./deployments.ts";
import type { TurnInput } from "./turns.ts";

function errorResponse(error: unknown): AgentdResponse {
  const known = error as { code?: string; message?: string; remediation?: string };
  const code = known.code ?? "INTERNAL";
  const status =
    error instanceof AgentHostError
      ? 404
      : code === "SESSION_BUSY"
        ? 409
        : code === "PAYER_MISSING"
          ? 402
          : 500;
  return { status, body: { error: code, message: known.message, remediation: known.remediation } };
}

function sse(events: AsyncGenerator<AgentEvent>): AsyncIterable<string> {
  return (async function* stream() {
    for await (const event of events) {
      yield `data: ${JSON.stringify(event)}\n\n`;
    }
  })();
}

export function createAgentsRouteModule(host: AgentHost): AgentdRouteModule {
  return {
    prefix: "/v1/agents",
    mount(app, ctx: Context) {
      app.route("POST", "/deployments", async (req: AgentdRequest) => {
        try {
          const input = req.body as RegisterDeploymentInput;
          const record = await host.registerDeployment(input);
          return { status: 201, body: { id: record.id } };
        } catch (error) {
          return errorResponse(error);
        }
      });

      app.route("GET", "/deployments", async () => ({ status: 200, body: { deployments: await host.listDeployments() } }));

      app.route("POST", "/aliases/:alias", async (req) => {
        const body = req.body as { deploymentId: string; by?: string };
        const deployment = await host.getDeployment(body.deploymentId);
        if (!deployment) {
          return { status: 404, body: { error: "DEPLOYMENT_NOT_FOUND", message: `unknown deployment ${body.deploymentId}.` } };
        }
        const pointer = await host.moveAlias(req.params.alias ?? "", body.deploymentId, body.by ?? "api");
        return { status: 200, body: pointer };
      });

      app.route("GET", "/aliases/:alias", async (req) => {
        const pointer = await host.getAlias(req.params.alias ?? "");
        return pointer ? { status: 200, body: pointer } : { status: 404, body: { error: "ALIAS_NOT_FOUND" } };
      });

      app.route("POST", "/sessions", async (req) => {
        try {
          const body = req.body as { agent: string; alias?: string };
          const meta = await host.createSession({ agent: body.agent, alias: body.alias ?? "development" });
          return { status: 201, body: meta };
        } catch (error) {
          return errorResponse(error);
        }
      });

      app.route("GET", "/sessions", async () => ({ status: 200, body: { sessions: await host.listSessions() } }));

      app.route("GET", "/sessions/:id", async (req) => {
        const meta = await host.getSession(req.params.id ?? "");
        return meta ? { status: 200, body: meta } : { status: 404, body: { error: "SESSION_NOT_FOUND" } };
      });

      app.route("POST", "/sessions/:id/turns", async (req) => {
        const meta = await host.getSession(req.params.id ?? "");
        if (!meta) return { status: 404, body: { error: "SESSION_NOT_FOUND" } };
        const input = (req.body ?? {}) as TurnInput;
        return {
          status: 200,
          headers: { "content-type": "text/event-stream" },
          stream: sse(host.turn(meta.id, input)),
        };
      });

      app.route("POST", "/secrets/sync", async (req) => {
        const resolver = ctx.get<EnvSecretResolver>("secrets");
        if (!resolver || typeof resolver.sync !== "function") {
          return { status: 503, body: { error: "SECRETS_UNAVAILABLE" } };
        }
        const body = req.body as { values?: Record<string, string> };
        resolver.sync(body.values ?? {});
        return { status: 204, body: undefined };
      });

      return () => {};
    },
  };
}
