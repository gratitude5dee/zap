import type { LlmRouteDescriptor } from "./types.ts";

export const gmiRoute: LlmRouteDescriptor = {
  id: "gmi",
  baseUrl: "https://api.gmi-serving.com/v1",
  flavor: "openai",
  keyEnv: "GMI_API_KEY",
  modelEnv: "ZAP_LLM_GMI_MODEL",
  defaultModel: "zai-org/GLM-4.5",
  prefixedModels: true,
};
