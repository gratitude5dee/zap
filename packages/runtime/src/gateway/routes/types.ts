import type { LlmRouteId } from "../index.ts";

/**
 * Static description of one LLM route. Route descriptors are pure data:
 * resolving one never contacts a provider or reads a key.
 */
export interface LlmRouteDescriptor {
  id: LlmRouteId;
  /** OpenAI-compatible chat endpoint base URL ("anthropic" uses the messages flavor). */
  baseUrl: string;
  flavor: "openai" | "anthropic";
  /** env var carrying the BYOK key; keys are resolved through the key resolver, never read here */
  keyEnv: string;
  /** env var overriding the default model for this route */
  modelEnv: string;
  defaultModel: string;
  /** whether model ids are provider-prefixed (e.g. "anthropic/claude-sonnet-4.6") */
  prefixedModels: boolean;
}
