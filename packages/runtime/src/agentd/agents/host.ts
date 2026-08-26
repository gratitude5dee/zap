// The in-VM agent host (§5.12): deployments + aliases + sessions + turns,
// composed over the kernel Context. Sessions pin their deployment at creation;
// alias moves never mutate them.
import type {
  Agent,
  AgentEvent,
  ConnectionDefinition,
  McpServerDefinition,
  ModelId,
} from "@wzrdtech/zap-agent";
import type { Context } from "@wzrdtech/zap-kernel";
import type { McpClient } from "../../harness/zap.ts";
import { createAliasStore, type AliasPointer } from "./aliases.ts";
import { createDeploymentStore, type DeploymentRecord, type RegisterDeploymentInput } from "./deployments.ts";
import { createSessionStore, type SessionMeta } from "./sessions.ts";
import { delegateToSubagent } from "./subagents.ts";
import { runTurn, type TurnDeps, type TurnInput } from "./turns.ts";

export class AgentHostError extends Error {
  readonly code: "ALIAS_NOT_FOUND" | "DEPLOYMENT_NOT_FOUND" | "AGENT_NOT_FOUND" | "SESSION_NOT_FOUND";
  readonly remediation?: string;

  constructor(options: { code: AgentHostError["code"]; message: string; remediation?: string }) {
    super(options.message);
    this.name = "AgentHostError";
    this.code = options.code;
    this.remediation = options.remediation;
  }
}

export interface LoadedProject {
  agents: Record<
    string,
    { agent: Agent; connections: ConnectionDefinition[]; mcpServers: McpServerDefinition[] }
  >;
}

export interface AgentHostOptions {
  ctx: Context;
  root: string;
  loadBundle(deployment: DeploymentRecord): Promise<LoadedProject>;
  defaultModel?: ModelId;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  log?(line: string): void;
  mcpClientFactory?(definition: McpServerDefinition): Promise<McpClient>;
  onSessionMeta?(meta: SessionMeta): void;
}

export interface AgentHost {
  registerDeployment(input: RegisterDeploymentInput): Promise<DeploymentRecord>;
  getDeployment(id: string): Promise<DeploymentRecord | null>;
  listDeployments(): Promise<string[]>;
  moveAlias(alias: string, deploymentId: string, by: string): Promise<AliasPointer>;
  getAlias(alias: string): Promise<AliasPointer | null>;
  aliasHistory(): Promise<AliasPointer[]>;
  createSession(input: { agent: string; alias: string }): Promise<SessionMeta>;
  getSession(id: string): Promise<SessionMeta | null>;
  listSessions(): Promise<SessionMeta[]>;
  turn(sessionId: string, input: TurnInput): AsyncGenerator<AgentEvent>;
}

export function createAgentHost(options: AgentHostOptions): AgentHost {
  const deployments = createDeploymentStore(options.root);
  const aliases = createAliasStore(options.root);
  const sessions = createSessionStore(options.root);
  const busy = new Set<string>();
  const log = options.log ?? (() => {});
  const projectCache = new Map<string, Promise<LoadedProject>>();

  function loadProject(deployment: DeploymentRecord): Promise<LoadedProject> {
    let cached = projectCache.get(deployment.id);
    if (!cached) {
      cached = options.loadBundle(deployment);
      projectCache.set(deployment.id, cached);
    }
    return cached;
  }

  async function turnDepsFor(meta: SessionMeta): Promise<TurnDeps> {
    const deployment = await deployments.get(meta.deploymentId);
    if (!deployment) {
      throw new AgentHostError({
        code: "DEPLOYMENT_NOT_FOUND",
        message: `session ${meta.id} is pinned to unknown deployment ${meta.deploymentId}.`,
      });
    }
    const project = await loadProject(deployment);
    const loaded = project.agents[meta.agent];
    if (!loaded) {
      throw new AgentHostError({
        code: "AGENT_NOT_FOUND",
        message: `agent ${meta.agent} is not in deployment ${meta.deploymentId}.`,
      });
    }
    const makeChildDeps = (agentId: string): TurnDeps | null => {
      const child = project.agents[agentId];
      if (!child) return null;
      return {
        ctx: options.ctx,
        project: deployment.manifest.project,
        sessions,
        busy,
        manifestEntry: deployment.manifest.agents[agentId],
        loaded: child,
        defaultModel: options.defaultModel,
        fetchImpl: options.fetchImpl,
        log,
        mcpClientFactory: options.mcpClientFactory,
      };
    };
    return {
      ctx: options.ctx,
      project: deployment.manifest.project,
      sessions,
      busy,
      manifestEntry: deployment.manifest.agents[meta.agent],
      loaded,
      defaultModel: options.defaultModel,
      fetchImpl: options.fetchImpl,
      log,
      mcpClientFactory: options.mcpClientFactory,
      delegate: (subagentId, input, parentTurn) =>
        delegateToSubagent(
          {
            sessions,
            deploymentId: meta.deploymentId,
            alias: meta.alias,
            makeTurnDeps: makeChildDeps,
          },
          subagentId,
          input,
          parentTurn,
        ),
    };
  }

  return {
    registerDeployment: (input) => deployments.register(input),
    getDeployment: (id) => deployments.get(id),
    listDeployments: () => deployments.list(),
    moveAlias: (alias, deploymentId, by) => aliases.move(alias, deploymentId, by),
    getAlias: (alias) => aliases.get(alias),
    aliasHistory: () => aliases.history(),
    async createSession(input) {
      const pointer = await aliases.get(input.alias);
      if (!pointer) {
        throw new AgentHostError({
          code: "ALIAS_NOT_FOUND",
          message: `alias ${input.alias} does not resolve to a deployment.`,
          remediation: `run zap deploy --alias ${input.alias} first.`,
        });
      }
      const deployment = await deployments.get(pointer.deploymentId);
      if (!deployment) {
        throw new AgentHostError({
          code: "DEPLOYMENT_NOT_FOUND",
          message: `alias ${input.alias} points at missing deployment ${pointer.deploymentId}.`,
        });
      }
      if (!deployment.manifest.agents[input.agent]) {
        throw new AgentHostError({
          code: "AGENT_NOT_FOUND",
          message: `agent ${input.agent} is not in deployment ${pointer.deploymentId}.`,
        });
      }
      const meta = await sessions.create({
        agent: input.agent,
        alias: input.alias,
        deploymentId: pointer.deploymentId,
      });
      options.onSessionMeta?.(meta);
      return meta;
    },
    getSession: (id) => sessions.get(id),
    listSessions: () => sessions.list(),
    async *turn(sessionId, input) {
      const meta = await sessions.get(sessionId);
      if (!meta) {
        throw new AgentHostError({ code: "SESSION_NOT_FOUND", message: `unknown session ${sessionId}.` });
      }
      const deps = await turnDepsFor(meta);
      for await (const event of runTurn(deps, meta, input)) {
        yield event;
        if (event.type === "turn.completed" || event.type === "turn.failed") {
          const updated = await sessions.get(sessionId);
          if (updated) options.onSessionMeta?.(updated);
        }
      }
    },
  };
}
