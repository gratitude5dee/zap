import type { LlmRouteDescriptor } from "./types.ts";

export const openrouterRoute: LlmRouteDescriptor = {
  id: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  flavor: "openai",
  keyEnv: "OPENROUTER_API_KEY",
  modelEnv: "ZAP_LLM_OPENROUTER_MODEL",
  defaultModel: "anthropic/claude-sonnet-4.6",
  prefixedModels: true,
};
