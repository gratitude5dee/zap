import type { LlmRouteDescriptor } from "./types.ts";

export const openaiRoute: LlmRouteDescriptor = {
  id: "openai",
  baseUrl: "https://api.openai.com/v1",
  flavor: "openai",
  keyEnv: "OPENAI_API_KEY",
  modelEnv: "ZAP_LLM_OPENAI_MODEL",
  defaultModel: "gpt-5.4",
  prefixedModels: false,
};
