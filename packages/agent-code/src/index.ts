// @wzrdtech/zap-agent public surface (§5.12): agents as code — synchronous
// renders, capability hooks, connections, and the build pipeline.
export type {
  AgentInput,
  ModelId,
  SecretRef,
  HeaderValue,
  JsonSchema,
  ToolInput,
  MeterUnit,
  MediaFsLike,
  TurnMessage,
  ToolContext,
  ToolDefinition,
  Tool,
  AnyTool,
  ConnectionDefinition,
  Connection,
  McpServerDefinition,
  McpServerRef,
  Agent,
  Project,
  SecretScope,
  ConnectionScope,
  ResolveSecret,
  AgentEvent,
} from "./types.ts";
export { AgentCodeError } from "./types.ts";
export {
  defineAgent,
  defineTool,
  defineRecipeTool,
  defineConnection,
  defineMcpServer,
  defineProject,
  useSecret,
  bearer,
} from "./define.ts";
export { useInput, useModel, useTool, useMcpServer, useSubagent, useSessionData } from "./hooks.ts";
export { renderAgent, type RenderFrameInput, type RenderCapabilities, type RenderResult } from "./render/guard.ts";
export {
  createConnectionFetch,
  checkConnectionRequest,
  normalizeConnectionPath,
  type ConnectionFetch,
  type ConnectionFetchInit,
  type CreateConnectionFetchOptions,
} from "./connections.ts";
export { headerSecretRef, sensitiveHeaderNames, secretsReferencedBy } from "./secrets.ts";
export {
  buildProject,
  listAgentDirs,
  loadAgentModulesFromBundle,
  type BuildProjectOptions,
  type BuildProjectResult,
} from "./build/bundle.ts";
export { lintProject, scanHookIds, type LintIssue, type LintProjectOptions } from "./build/lint.ts";
export {
  manifestEntryFor,
  type AgentManifestEntry,
  type DeploymentManifest,
  type LoadedAgentModules,
  type ManifestConnection,
  type ManifestMcpServer,
} from "./build/manifest.ts";
export { staticSecretResolver } from "./testing.ts";
