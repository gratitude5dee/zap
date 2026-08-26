// Deployment manifest (§5.12): names and shapes only — never secret values.
import { sensitiveHeaderNames, secretsReferencedBy } from "../secrets.ts";
import type {
  Agent,
  ConnectionDefinition,
  JsonSchema,
  McpServerDefinition,
  AnyTool,
} from "../types.ts";

export interface ManifestConnection {
  id: string;
  origin: string;
  methods: readonly string[];
  pathPrefix: string;
  headerNames: string[];
  sensitiveHeaderNames: string[];
}

export interface ManifestMcpServer {
  id: string;
  url?: string;
  headerNames: string[];
  sensitiveHeaderNames: string[];
  sideEffecting: string[];
}

export interface AgentManifestEntry {
  description?: string;
  tools: Array<{ name: string; readOnly: boolean; inputSchema: JsonSchema }>;
  connections: ManifestConnection[];
  mcpServers: string[];
  mcpServerDefs?: ManifestMcpServer[];
  subagents: string[];
  skills: string[];
  secretsReferenced: string[];
}

export interface DeploymentManifest {
  project: string;
  agents: Record<string, AgentManifestEntry>;
  bundleSha: string;
  builtAt: string;
  pins: Record<string, string>;
}

export interface LoadedAgentModules {
  agent: Agent;
  tools: AnyTool[];
  connections: ConnectionDefinition[];
  mcpServers: McpServerDefinition[];
  subagents: string[];
  skills: string[];
}

export function manifestEntryFor(loaded: LoadedAgentModules): AgentManifestEntry {
  return {
    description: loaded.agent.meta?.description,
    tools: loaded.tools
      .map((tool) => ({
        name: tool.definition.name,
        readOnly: tool.definition.readOnly ?? false,
        inputSchema: tool.definition.input,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    connections: loaded.connections.map((def) => ({
      id: def.id,
      origin: def.origin,
      methods: def.methods,
      pathPrefix: def.pathPrefix,
      headerNames: Object.keys(def.headers ?? {}).sort(),
      sensitiveHeaderNames: sensitiveHeaderNames(def),
    })),
    mcpServers: loaded.mcpServers.map((def) => def.id).sort(),
    mcpServerDefs: loaded.mcpServers.map((def) => ({
      id: def.id,
      url: def.url,
      headerNames: Object.keys(def.headers ?? {}).sort(),
      sensitiveHeaderNames: sensitiveHeaderNames(def),
      sideEffecting: [...(def.sideEffecting ?? [])],
    })),
    subagents: [...loaded.subagents].sort(),
    skills: [...loaded.skills].sort(),
    secretsReferenced: secretsReferencedBy(loaded.connections, loaded.mcpServers),
  };
}
