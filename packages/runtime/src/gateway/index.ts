import { definePlugin } from "@wzrdtech/zap-kernel";
import { quoteStep, type ZapPlan, type ZapStep, type ZapStepKind } from "@wzrdtech/core";
import type { ProviderId } from "@wzrdtech/providers";
import { z } from "zod";
import { GatewayError, type GatewayErrorCode } from "./errors.ts";
import { createMediaService, type MediaService, type MediaSubmitInput } from "./media.ts";
import {
  RouterError,
  buildIdempotencyKey,
  listCapabilityManifest,
  quoteGeneration,
  quoteGenerationForMode,
  selectAdapter,
  selectProviderById,
  type MediaGenRequest,
} from "./router.ts";
import { aiGatewayRoute } from "./routes/ai-gateway.ts";
import { anthropicRoute } from "./routes/anthropic.ts";
import { gmiRoute } from "./routes/gmi.ts";
import { openaiRoute } from "./routes/openai.ts";
import { openrouterRoute } from "./routes/openrouter.ts";
import { xaiRoute } from "./routes/xai.ts";
import type { LlmRouteDescriptor } from "./routes/types.ts";

export { GatewayError, type GatewayErrorCode };
export {
  RouterError,
  buildIdempotencyKey,
  listCapabilityManifest,
  quoteGeneration,
  quoteGenerationForMode,
  selectAdapter,
  selectProviderById,
  type MediaGenRequest,
};
export { createMediaService, type MediaService, type MediaSubmitInput };
export type { LlmRouteDescriptor };

/** "gateway" = Vercel AI Gateway (the 0.3.1 default route id, kept). */
export type LlmRouteId = "openrouter" | "gateway" | "openai" | "anthropic" | "xai" | "gmi";
export type MediaProviderId = ProviderId | "replicate";

export const llmRoutes: Record<LlmRouteId, LlmRouteDescriptor> = {
  openrouter: openrouterRoute,
  gateway: aiGatewayRoute,
  openai: openaiRoute,
  anthropic: anthropicRoute,
  xai: xaiRoute,
  gmi: gmiRoute,
};

export interface LlmToolSpec {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; input: unknown }>;
}

export interface LlmStepResult {
  text: string;
  toolCalls: Array<{ id: string; name: string; input: unknown }>;
  usage: { inputTokens: number; outputTokens: number; reasoningTokens?: number; usd: number };
}

export interface LlmService {
  readonly route: LlmRouteId;
  readonly model: string;
  step(req: { messages: LlmMessage[]; tools?: LlmToolSpec[]; signal?: AbortSignal }): Promise<LlmStepResult>;
}

export interface GatewayService {
  llm(route: LlmRouteId, opts: { model: string; auth?: "byok" | "claude-code" | "codex" | "managed" }): LlmService;
  /** wraps ProviderAdapter.submit/poll/price with the deterministic router */
  media(provider: MediaProviderId, opts: { model?: string }): MediaService;
  route(
    capability: ZapStepKind,
    hint?: { provider?: MediaProviderId; model?: string },
  ): { provider: MediaProviderId; model: string; usdEstimate: number };
  /** never calls a provider */
  quote(plan: ZapPlan): Promise<{ usd: number; lines: Array<{ stepId: string; usd: number; unit: string }> }>;
}

export interface GatewayServiceOptions {
  /** BYOK key resolution; in-VM this is ctx.secrets.gatewayKey (§5.12), never process.env */
  resolveKey?(route: LlmRouteId): Promise<string | undefined> | string | undefined;
  fetchImpl?: typeof fetch;
}

function lineUnit(step: ZapStep): string {
  if (step.kind === "stitch" || step.kind === "keyframes") return "local";
  return step.duration_s !== undefined ? "second" : "request";
}

function toolCallsFromChoice(message: {
  content?: string | null;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
}): LlmStepResult["toolCalls"] {
  return (message.tool_calls ?? []).map((call) => ({
    id: call.id,
    name: call.function.name,
    input: call.function.arguments ? (JSON.parse(call.function.arguments) as unknown) : {},
  }));
}

function createLlmService(
  descriptor: LlmRouteDescriptor,
  model: string,
  options: GatewayServiceOptions,
): LlmService {
  if ((descriptor.id === "openai" || descriptor.id === "anthropic") && model.includes("/")) {
    throw new GatewayError({
      code: "MODEL_INCOMPATIBLE",
      message: `${descriptor.id} direct routing requires a provider-native model id without a provider prefix; received ${model}.`,
    });
  }
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    route: descriptor.id,
    model,
    async step(req) {
      const key = await options.resolveKey?.(descriptor.id);
      if (!key) {
        throw new GatewayError({
          code: "KEY_UNAVAILABLE",
          message: `No key resolved for route ${descriptor.id}.`,
          remediation: "Run zap secret sync (or any CLI contact) to sync gateway keys into the runtime.",
        });
      }
      const tools = (req.tools ?? []).map((tool) => ({
        type: "function" as const,
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
      }));

      if (descriptor.flavor === "anthropic") {
        const response = await fetchImpl(`${descriptor.baseUrl}/v1/messages`, {
          method: "POST",
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
          body: JSON.stringify({
            max_tokens: 4096,
            messages: req.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
            model,
            system: req.messages.find((m) => m.role === "system")?.content,
            tools: (req.tools ?? []).map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.inputSchema,
            })),
          }),
          signal: req.signal ?? null,
        });
        const body = (await response.json()) as {
          content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const blocks = body.content ?? [];
        return {
          text: blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join(""),
          toolCalls: blocks
            .filter((b) => b.type === "tool_use")
            .map((b) => ({ id: b.id ?? "", name: b.name ?? "", input: b.input ?? {} })),
          usage: {
            inputTokens: body.usage?.input_tokens ?? 0,
            outputTokens: body.usage?.output_tokens ?? 0,
            usd: 0,
          },
        };
      }

      const response = await fetchImpl(`${descriptor.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: req.messages.map((m) => ({
            content: m.content,
            role: m.role,
            tool_call_id: m.toolCallId,
          })),
          model,
          tools: tools.length > 0 ? tools : undefined,
        }),
        signal: req.signal ?? null,
      });
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const message = body.choices?.[0]?.message ?? {};
      return {
        text: message.content ?? "",
        toolCalls: toolCallsFromChoice(message),
        usage: {
          inputTokens: body.usage?.prompt_tokens ?? 0,
          outputTokens: body.usage?.completion_tokens ?? 0,
          usd: 0,
        },
      };
    },
  };
}

export function createGatewayService(options: GatewayServiceOptions = {}): GatewayService {
  return {
    llm(route, opts) {
      const descriptor = llmRoutes[route];
      if (!descriptor) {
        throw new GatewayError({ code: "ROUTE_UNKNOWN", message: `Unknown LLM route ${String(route)}.` });
      }
      return createLlmService(descriptor, opts.model || descriptor.defaultModel, options);
    },
    media(provider, opts) {
      return createMediaService(provider, opts);
    },
    route(capability, hint) {
      const provider = (hint?.provider ?? "gmi") as MediaProviderId;
      const adapter = selectProviderById(provider);
      const model = hint?.model ?? adapter.defaultModel(capability);
      const { usd } = quoteGenerationForMode(
        {
          capability,
          inputs: {},
          model,
          prompt: "",
          provider,
          runId: "route",
          stepId: "route",
        },
        { live: false },
      );
      return { provider, model, usdEstimate: usd };
    },
    async quote(plan) {
      const lines = plan.steps.map((step) => ({
        stepId: step.id,
        unit: lineUnit(step),
        usd: quoteStep(step),
      }));
      return { usd: lines.reduce((sum, line) => sum + line.usd, 0), lines };
    },
  };
}

export interface GatewayPluginConfig {
  resolveKey?: GatewayServiceOptions["resolveKey"];
}

const schema = z
  .object({
    resolveKey: z.custom<NonNullable<GatewayServiceOptions["resolveKey"]>>((v) => typeof v === "function").optional(),
  })
  .optional();

/** In-VM gateway plugin: provides the "gateway" service. */
export const gatewayCore = definePlugin<GatewayPluginConfig | undefined>({
  name: "gateway.core",
  schema,
  apply(ctx, config) {
    ctx.provide("gateway", createGatewayService({ resolveKey: config?.resolveKey }));
  },
});
