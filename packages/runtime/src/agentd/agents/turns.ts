// The §4.12 turn loop: render → executeStep → repeat until final. One turn at
// a time per session (SESSION_BUSY), payer fails closed before any model call.
import type {
  Agent,
  AgentEvent,
  AgentInput,
  ConnectionDefinition,
  McpServerDefinition,
  ModelId,
  ToolContext,
  TurnMessage,
  AgentManifestEntry,
} from "@wzrdtech/zap-agent";
import { renderAgent } from "@wzrdtech/zap-agent";
import type { Context } from "@wzrdtech/zap-kernel";
import type { SandboxHandle } from "@wzrdtech/zap-sandbox";
import { executeStep, resolvePayerMode, type McpClient, type PayStatusService, type StepEvent } from "../../harness/zap.ts";
import { createAgentConnections } from "../../connections/fetch.ts";
import type { SecretResolver } from "../../secrets/resolver.ts";
import type { SessionMeta, SessionStore } from "./sessions.ts";

const MAX_STEPS = 8;

export interface LoadedAgent {
  agent: Agent;
  connections: ConnectionDefinition[];
  mcpServers: McpServerDefinition[];
}

export interface TurnInput {
  text?: string;
  payload?: unknown;
  live?: boolean;
  payer?: string;
  source?: AgentInput["source"];
}

export interface TurnDeps {
  ctx: Context;
  project: string;
  sessions: SessionStore;
  busy: Set<string>;
  manifestEntry: AgentManifestEntry | undefined;
  loaded: LoadedAgent;
  defaultModel?: ModelId;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  log(line: string): void;
  mcpClientFactory?(definition: McpServerDefinition): Promise<McpClient>;
  delegate?(subagentId: string, input: { text?: string; payload?: unknown }, turnInput: TurnInput): Promise<string>;
}

const stubMcpClient: McpClient = {
  async listTools() {
    return [];
  },
  async callTool(name: string) {
    throw new Error(`MCP tool ${name} is not available on this runtime.`);
  },
  async close() {},
};

export async function* runTurn(deps: TurnDeps, meta: SessionMeta, input: TurnInput): AsyncGenerator<AgentEvent> {
  const turn = meta.turns + 1;
  const live = input.live === true;

  if (deps.busy.has(meta.id)) {
    yield {
      type: "turn.failed",
      sessionId: meta.id,
      turn,
      code: "SESSION_BUSY",
      remediation: "wait for the in-flight turn to finish, then retry.",
    };
    return;
  }
  deps.busy.add(meta.id);

  try {
    const payerMode = await resolvePayerMode(deps.ctx.get<PayStatusService>("pay"));
    const payer = input.payer ?? payerMode;
    yield { type: "turn.started", sessionId: meta.id, turn, live, payer };

    const events: AgentEvent[] = [];
    const controller = new AbortController();
    const handle = deps.ctx.get<SandboxHandle>("sandboxHandle");
    const resolver = deps.ctx.get<SecretResolver>("secrets");
    if (!handle || !resolver) {
      yield { type: "turn.failed", sessionId: meta.id, turn, code: "RUNTIME_UNAVAILABLE" };
      return;
    }

    const sessionData = await deps.sessions.getData(meta.id);
    const agentInput: AgentInput = {
      source: input.source ?? "api",
      text: input.text,
      payload: input.payload,
      live,
      sessionId: meta.id,
      turn,
      alias: meta.alias,
    };

    const history: TurnMessage[] = await deps.sessions.readMessages(meta.id);
    const userMessage: TurnMessage = { role: "user", content: input.text ?? "" };
    history.push(userMessage);
    const newMessages: TurnMessage[] = [userMessage];

    const connections = createAgentConnections(deps.loaded.connections, {
      entry: deps.manifestEntry,
      scope: { project: deps.project, agentId: meta.agent, alias: meta.alias },
      resolver,
      fetchImpl: deps.fetchImpl,
    });

    const toolContext: Omit<ToolContext<never>, "input" | "signal"> = {
      sandbox: { exec: (argv, opts) => handle.exec(argv, opts) },
      fs: {
        read: (p) => handle.fs.read(resolveFsPath(p)),
        write: (p, bytes) =>
          handle.fs.write(resolveFsPath(p), typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes),
        readdir: async (p) => ((await handle.fs.readdir?.(resolveFsPath(p))) ?? []).map((entry) => entry.name),
      },
      connections,
      session: {
        id: meta.id,
        alias: meta.alias,
        data: {
          get: async <T,>(key: string): Promise<T | undefined> =>
            ((await deps.sessions.getData(meta.id))[key] as T | undefined),
          set: async (key: string, value: unknown): Promise<void> => {
            const data = await deps.sessions.getData(meta.id);
            data[key] = value;
            await deps.sessions.setData(meta.id, data);
          },
        },
      },
      reportProgress: async (progress) => {
        deps.log(JSON.stringify({ kind: "progress", session: meta.id, turn, ...progress }));
      },
      live,
      log: (entry) => deps.log(JSON.stringify({ kind: "tool", session: meta.id, turn, ...entry })),
    };

    const mcp = new Map<string, { definition: McpServerDefinition; client(): Promise<McpClient> }>();
    for (const definition of deps.loaded.mcpServers) {
      mcp.set(definition.id, {
        definition,
        client: () => (deps.mcpClientFactory ? deps.mcpClientFactory(definition) : Promise.resolve(stubMcpClient)),
      });
    }

    const usageTotal = { inputTokens: 0, outputTokens: 0, usd: 0 };
    let finalText = "";

    try {
      for (let step = 0; step < MAX_STEPS; step += 1) {
        const rendered = renderAgent(deps.loaded.agent, {
          input: agentInput,
          sessionData,
          defaultModel: deps.defaultModel,
        });
        if (step === 0) {
          yield {
            type: "render",
            sessionId: meta.id,
            turn,
            instructions: rendered.instructions,
            model: rendered.capabilities.model,
            tools: [...rendered.capabilities.tools.keys()].sort(),
            mcpServers: [...rendered.capabilities.mcpServers].sort(),
            subagents: [...rendered.capabilities.subagents.keys()].sort(),
          };
        }

        const stepEvents: StepEvent[] = [];
        const result = await executeStep(
          deps.ctx,
          {
            instructions: rendered.instructions,
            model: rendered.capabilities.model,
            tools: rendered.capabilities.tools,
            mcpServers: rendered.capabilities.mcpServers,
            subagents: rendered.capabilities.subagents,
          },
          {
            signal: controller.signal,
            history,
            mcp,
            delegate: deps.delegate
              ? async (subagentId, subInput) => ({
                  text: await deps.delegate!(subagentId, subInput, input),
                  events: [],
                })
              : undefined,
            onEvent: (event) => stepEvents.push(event),
            toolContext,
          },
        );
        for (const event of stepEvents) {
          events.push(event);
          yield event;
        }
        usageTotal.inputTokens += result.usage.inputTokens;
        usageTotal.outputTokens += result.usage.outputTokens;
        usageTotal.usd += result.usage.usd;

        if (result.kind === "final") {
          finalText = result.text;
          const assistantMessage: TurnMessage = { role: "assistant", content: result.text };
          history.push(assistantMessage);
          newMessages.push(assistantMessage);
          break;
        }
        history.push(...result.messages);
        newMessages.push(...result.messages);
      }
    } catch (error) {
      const failure = error as { code?: string; remediation?: string; message?: string };
      deps.log(
        JSON.stringify({
          kind: "turn.failed",
          session: meta.id,
          turn,
          code: failure.code ?? "TURN_FAILED",
          message: typeof failure.message === "string" ? failure.message : undefined,
        }),
      );
      yield {
        type: "turn.failed",
        sessionId: meta.id,
        turn,
        code: failure.code ?? "TURN_FAILED",
        remediation: failure.remediation,
      };
      return;
    }

    await deps.sessions.appendMessages(meta.id, newMessages);
    await deps.sessions.appendTurn(meta.id, {
      turn,
      live,
      payer,
      text: finalText,
      usage: usageTotal,
      at: new Date().toISOString(),
    });
    await deps.sessions.update(meta.id, { turns: turn, lastActiveAt: new Date().toISOString(), status: "idle" });
    yield { type: "turn.completed", sessionId: meta.id, turn, text: finalText, usage: usageTotal };
  } finally {
    deps.busy.delete(meta.id);
  }
}

function resolveFsPath(p: string): string {
  return p.startsWith("/") ? p : `/zap/fs/${p}`;
}
