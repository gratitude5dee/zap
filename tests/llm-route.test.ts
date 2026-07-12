import { describe, expect, it, vi } from "vitest";
import {
  createLlmModel,
  resolveLlmRoute,
  type LlmRoute,
  type LlmRouteSelection,
} from "../lib/llm-route";

describe("LLM routing", () => {
  it("defaults to the Vercel AI Gateway and the existing Zap model", () => {
    expect(resolveLlmRoute({})).toEqual({
      modelId: "anthropic/claude-sonnet-4.6",
      route: "gateway",
    });
  });

  it.each([
    ["gateway", "ZAP_LLM_GATEWAY_MODEL", "openai/gpt-5.4"],
    ["openai", "ZAP_LLM_OPENAI_MODEL", "gpt-5.4-mini"],
    ["anthropic", "ZAP_LLM_ANTHROPIC_MODEL", "claude-opus-4-1"],
    ["openrouter", "ZAP_LLM_OPENROUTER_MODEL", "google/gemini-2.5-flash"],
  ] satisfies Array<[LlmRoute, string, string]>) (
    "uses the %s-specific model id",
    (route, modelEnv, modelId) => {
      expect(resolveLlmRoute({
        ZAP_LLM_MODEL: "generic/fallback",
        ZAP_LLM_ROUTE: route,
        [modelEnv]: modelId,
      })).toEqual({ modelId, route });
    },
  );

  it("lets a call-site model override take precedence over environment defaults", () => {
    expect(resolveLlmRoute({
      ZAP_LLM_GATEWAY_MODEL: "configured/model",
      ZAP_LLM_ROUTE: "gateway",
    }, "judge/model")).toEqual({
      modelId: "judge/model",
      route: "gateway",
    });
  });

  it("rejects an unsupported route with the accepted values", () => {
    expect(() => resolveLlmRoute({ ZAP_LLM_ROUTE: "bedrock" })).toThrow(
      "ZAP_LLM_ROUTE must be one of gateway, openai, anthropic, openrouter",
    );
  });

  it.each([
    ["openai", "OPENAI_API_KEY"],
    ["anthropic", "ANTHROPIC_API_KEY"],
    ["openrouter", "OPENROUTER_API_KEY"],
  ] satisfies Array<[LlmRoute, string]>) (
    "requires %s credentials before loading a provider",
    async (route, credentialEnv) => {
      const selection = resolveLlmRoute({ ZAP_LLM_ROUTE: route });
      await expect(createLlmModel(selection, { env: {} })).rejects.toThrow(credentialEnv);
    },
  );

  it.each([
    ["gateway", undefined],
    ["openai", "OPENAI_API_KEY"],
    ["anthropic", "ANTHROPIC_API_KEY"],
    ["openrouter", "OPENROUTER_API_KEY"],
  ] satisfies Array<[LlmRoute, string | undefined]>) (
    "dispatches the %s route through its model factory",
    async (route, credentialEnv) => {
      const model = { modelId: `${route}-model`, provider: `test.${route}` };
      const factory = vi.fn(async () => model as never);
      const selection: LlmRouteSelection = { modelId: `${route}-model`, route };
      const env = credentialEnv ? { [credentialEnv]: `${route}-secret` } : {};

      await expect(createLlmModel(selection, {
        env,
        factories: { [route]: factory },
      })).resolves.toBe(model);
      expect(factory).toHaveBeenCalledWith({
        apiKey: credentialEnv ? `${route}-secret` : undefined,
        modelId: `${route}-model`,
        route,
      });
    },
  );
});
