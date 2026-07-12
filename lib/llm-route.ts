import { createOpenAI } from "@ai-sdk/openai";
import { gateway, type LanguageModel } from "ai";

export const LLM_ROUTES = ["gateway", "openai", "anthropic", "openrouter"] as const;

export type LlmRoute = (typeof LLM_ROUTES)[number];
export type LlmRouteEnv = Readonly<Record<string, string | undefined>>;

export type LlmRouteSelection = {
  modelId: string;
  route: LlmRoute;
};

export type LlmModelFactoryInput = LlmRouteSelection & {
  apiKey?: string;
};

export type LlmModelFactory = (input: LlmModelFactoryInput) => LanguageModel | Promise<LanguageModel>;

export type CreateLlmModelOptions = {
  env?: LlmRouteEnv;
  factories?: Partial<Record<LlmRoute, LlmModelFactory>>;
};

const defaultModels: Record<LlmRoute, string> = {
  anthropic: "claude-sonnet-4-6",
  gateway: "anthropic/claude-sonnet-4.6",
  openai: "gpt-5.4",
  openrouter: "anthropic/claude-sonnet-4.6",
};

const routeModelEnv: Record<LlmRoute, string> = {
  anthropic: "ZAP_LLM_ANTHROPIC_MODEL",
  gateway: "ZAP_LLM_GATEWAY_MODEL",
  openai: "ZAP_LLM_OPENAI_MODEL",
  openrouter: "ZAP_LLM_OPENROUTER_MODEL",
};

const routeCredentialEnv: Partial<Record<LlmRoute, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

/** Resolve routing metadata without loading or contacting a provider. */
export function resolveLlmRoute(
  env: LlmRouteEnv = process.env,
  modelOverride?: string,
): LlmRouteSelection {
  const rawRoute = env.ZAP_LLM_ROUTE?.trim().toLowerCase() || "gateway";
  if (!isLlmRoute(rawRoute)) {
    throw new Error(`ZAP_LLM_ROUTE must be one of ${LLM_ROUTES.join(", ")}; received ${rawRoute}.`);
  }

  const modelId = firstNonEmpty(
    modelOverride,
    env[routeModelEnv[rawRoute]],
    env.ZAP_LLM_MODEL,
    defaultModels[rawRoute],
  );
  return { modelId, route: rawRoute };
}

/** Create the selected AI SDK model. Direct routes require their provider key. */
export async function createLlmModel(
  selection: LlmRouteSelection = resolveLlmRoute(),
  options: CreateLlmModelOptions = {},
): Promise<LanguageModel> {
  const env = options.env ?? process.env;
  const credentialEnv = routeCredentialEnv[selection.route];
  const apiKey = credentialEnv ? env[credentialEnv]?.trim() : undefined;
  if (credentialEnv && !apiKey) {
    throw new Error(`${credentialEnv} is required when ZAP_LLM_ROUTE=${selection.route}.`);
  }

  const factory = options.factories?.[selection.route] ?? defaultFactory(selection.route);
  return await factory({ ...selection, apiKey });
}

function defaultFactory(route: LlmRoute): LlmModelFactory {
  switch (route) {
    case "gateway":
      return ({ modelId }) => gateway(modelId);
    case "openai":
      return ({ apiKey, modelId }) => createOpenAI({ apiKey })(modelId);
    case "openrouter":
      return ({ apiKey, modelId }) => createOpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        name: "openrouter",
      }).chat(modelId);
    case "anthropic":
      return createAnthropicModel;
  }
}

async function createAnthropicModel({ apiKey, modelId }: LlmModelFactoryInput): Promise<LanguageModel> {
  const packageName = "@ai-sdk/anthropic";
  try {
    const module = await import(packageName) as {
      createAnthropic?: (options: { apiKey?: string }) => (modelId: string) => LanguageModel;
    };
    if (typeof module.createAnthropic !== "function") {
      throw new Error(`${packageName} does not export createAnthropic.`);
    }
    return module.createAnthropic({ apiKey })(modelId);
  } catch (error) {
    throw new Error(
      `Direct Anthropic routing requires ${packageName}; install it before setting ZAP_LLM_ROUTE=anthropic.`,
      { cause: error },
    );
  }
}

function isLlmRoute(value: string): value is LlmRoute {
  return (LLM_ROUTES as readonly string[]).includes(value);
}

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  throw new Error("An LLM model id is required.");
}
