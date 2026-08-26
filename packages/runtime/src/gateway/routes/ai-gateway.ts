import type { LlmRouteDescriptor } from "./types.ts";

/** "gateway" keeps the 0.3.1 default route id (Vercel AI Gateway). */
export const aiGatewayRoute: LlmRouteDescriptor = {
  id: "gateway",
  baseUrl: "https://ai-gateway.vercel.sh/v1",
  flavor: "openai",
  keyEnv: "AI_GATEWAY_API_KEY",
  modelEnv: "ZAP_LLM_GATEWAY_MODEL",
  defaultModel: "anthropic/claude-sonnet-4.6",
  prefixedModels: true,
};
