import type { LlmRouteDescriptor } from "./types.ts";

export const xaiRoute: LlmRouteDescriptor = {
  id: "xai",
  baseUrl: "https://api.x.ai/v1",
  flavor: "openai",
  keyEnv: "XAI_API_KEY",
  modelEnv: "ZAP_LLM_XAI_MODEL",
  defaultModel: "grok-4",
  prefixedModels: false,
};
