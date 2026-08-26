/** Zap cloud control API: the Hono app, pay gate, gateway proxy, and sweeper. */
export { createCloudApp, type CreateCloudAppOptions } from "./app.ts";
export { createGate, gatePriceUsd, paymentRequiredHeader } from "./gate.ts";
export { mountGateway } from "./gateway.ts";
export { sweepRuntimes, type SweepResult } from "./sweep.ts";
export {
  memoryCloudMeter,
  memoryNonceStore,
  memoryOpsCounters,
  memoryRateLimiter,
  memoryReceiptStore,
  memoryRuntimeStore,
} from "./memory.ts";
export {
  createSessionsModule,
  memoryAgentSessionStore,
  type AgentSessionRow,
  type AgentSessionStore,
  type RuntimeAgentdTransport,
  type SessionsModuleOptions,
} from "./sessions/index.ts";
export {
  createSecretsResolveModule,
  memoryTenantSecretStore,
  type TenantSecretRecord,
  type TenantSecretStore,
} from "./secrets/resolve.ts";
export { createVercelCloud, vercelFetchHandler, type VercelAdapterOptions } from "./adapters/vercel.ts";
export { thirdwebFacilitator, type ThirdwebFacilitatorOptions } from "./facilitators/thirdweb.ts";
export { cdpFacilitator, type CdpFacilitatorOptions } from "./facilitators/cdp.ts";
export {
  cloudflareWorker,
  createCloudflareCloud,
  type CloudflareAdapterOptions,
} from "./adapters/cloudflare.ts";
export type {
  CloudDeps,
  CloudHono,
  CloudMeter,
  CloudMiddleware,
  CloudRouteModule,
  CloudVars,
  Facilitator,
  LedgerRow,
  LlmUpstream,
  NonceStore,
  OpsCounters,
  PayProtocol,
  RateLimitConfig,
  RateLimiter,
  ReceiptRow,
  ReceiptStore,
  RuntimeRow,
  RuntimeState,
  RuntimeStore,
  SandboxProvider,
  SandboxStop,
  VerifiedPayment,
} from "./types.ts";

export interface CloudApiInfo {
  name: "zap-cloud";
  version: string;
  routes: readonly string[];
}

export function cloudApiInfo(version: string): CloudApiInfo {
  return {
    name: "zap-cloud",
    version,
    routes: ["/v1/runtimes", "/v1/sessions", "/v1/pay", "/v1/meter", "/v1/templates"],
  };
}
