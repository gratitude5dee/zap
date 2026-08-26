import type { LlmRouteDescriptor } from "./types.ts";

export const anthropicRoute: LlmRouteDescriptor = {
  id: "anthropic",
  baseUrl: "https://api.anthropic.com",
  flavor: "anthropic",
  keyEnv: "ANTHROPIC_API_KEY",
  modelEnv: "ZAP_LLM_ANTHROPIC_MODEL",
  defaultModel: "claude-sonnet-4-6",
  prefixedModels: false,
};
