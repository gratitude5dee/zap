import { createCloudflareCloud } from "./adapters/cloudflare.ts";
import { createVercelCloud } from "./adapters/vercel.ts";
import {
  memoryCloudMeter,
  memoryNonceStore,
  memoryOpsCounters,
  memoryRateLimiter,
  memoryReceiptStore,
  memoryRuntimeStore,
} from "./memory.ts";
import type {
  CloudDeps,
  CloudHono,
  CloudRouteModule,
  Facilitator,
  LedgerRow,
  LlmUpstream,
  RateLimitConfig,
  RuntimeRow,
  SandboxProvider,
  SandboxStop,
} from "./types.ts";

export const TEST_TREASURY = "0x5dee000000000000000000000000000000000000";

function encode(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function x402Credential(input: { nonce: string; amountUsd: number; payer?: string }): string {
  return encode({ kind: "x402", nonce: input.nonce, amountUsd: input.amountUsd, payer: input.payer ?? "0xalice" });
}

export function x402V1Credential(input: { nonce: string; amountUsd: number; payer?: string }): string {
  return encode({ kind: "x402-v1", nonce: input.nonce, amountUsd: input.amountUsd, payer: input.payer ?? "0xalice" });
}

export function mppCredential(input: { challengeId: string; amountUsd: number; payer?: string }): string {
  return encode({ kind: "mpp", nonce: input.challengeId, amountUsd: input.amountUsd, payer: input.payer ?? "0xalice" });
}

function fakeFacilitator(fails: boolean): Facilitator {
  return {
    async verify(payload) {
      if (fails) throw new Error("facilitator unavailable");
      const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as {
        nonce: string;
        amountUsd: number;
        payer: string;
      };
      return { payer: decoded.payer, amountUsd: decoded.amountUsd, nonce: decoded.nonce };
    },
    async settle() {
      if (fails) throw new Error("facilitator unavailable");
      return { txHash: `0xtx${Math.random().toString(16).slice(2, 10)}` };
    },
  };
}

export interface FakeSandbox extends SandboxProvider {
  forkBodies: Array<Record<string, unknown>>;
  stops: SandboxStop[];
  failWith(id: string, code: string): void;
}

function fakeSandbox(): FakeSandbox {
  const failures = new Map<string, string>();
  const forkBodies: Array<Record<string, unknown>> = [];
  const stops: SandboxStop[] = [];
  return {
    forkBodies,
    stops,
    failWith(id, code) {
      failures.set(id, code);
    },
    async create() {
      return { providerId: `sbx_${Math.random().toString(16).slice(2, 10)}` };
    },
    async exec(_id, command) {
      return { stdout: command.join(" "), exitCode: 0 };
    },
    async stop(options) {
      const failure = failures.get(options.id);
      if (failure) throw new Error(failure);
      stops.push({ ...options });
    },
    async snapshot(id) {
      return { snapshotId: `snap_${id}` };
    },
    async fork(_id, body) {
      forkBodies.push(body);
      return { providerId: `sbx_fork_${Math.random().toString(16).slice(2, 10)}` };
    },
  };
}

function fakeUpstream(): LlmUpstream {
  const leakyHeaders = {
    "x-api-key": "sk-test-upstream",
    authorization: "Bearer sk-test-upstream",
  };
  return {
    async llm(_path, body) {
      if (body.stream === true) {
        const sse = ['data: {"choices":[{"delta":{"content":"hi"}}]}', "", "data: [DONE]", "", ""].join("\n");
        return new Response(sse, {
          status: 200,
          headers: { "content-type": "text/event-stream", ...leakyHeaders },
        });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "hello" } }],
          usage: { prompt_tokens: 5, completion_tokens: 7 },
        }),
        { status: 200, headers: { "content-type": "application/json", ...leakyHeaders } },
      );
    },
    async media(_provider, kind, _body) {
      return new Response(JSON.stringify({ requestId: "req_1", kind }), {
        status: 200,
        headers: { "content-type": "application/json", ...leakyHeaders },
      });
    },
  };
}

export interface CreateTestCloudOptions {
  adapter: "vercel" | "cloudflare";
  env?: Record<string, string>;
  facilitatorFails?: boolean;
  limits?: RateLimitConfig;
  modules?: CloudRouteModule[];
}

export interface TestCloud {
  app: CloudHono;
  deps: CloudDeps;
  events: string[];
  meterLines: LedgerRow[];
  sandbox: FakeSandbox;
  seedRuntime(input: { id: string; state: RuntimeRow["state"]; stopAfter: string | null }): Promise<void>;
}

/** In-memory cloud used by the test suites; both adapters assemble the same app. */
export function createTestCloud(options: CreateTestCloudOptions): TestCloud {
  const events: string[] = [];
  const meterLines: LedgerRow[] = [];
  const trace = (event: string): void => {
    events.push(event);
  };
  const sandbox = fakeSandbox();
  const deps: CloudDeps = {
    env: {
      ZAP_CRON_SECRET: "test-cron-secret",
      ZAP_ADMIN_TOKEN: "test-admin-token",
      ...options.env,
    },
    runtimes: memoryRuntimeStore(),
    receipts: memoryReceiptStore(trace),
    nonces: memoryNonceStore(),
    meter: memoryCloudMeter(trace, (line) => meterLines.push(line)),
    sandbox,
    facilitator: fakeFacilitator(options.facilitatorFails === true),
    limiter: memoryRateLimiter(),
    counters: memoryOpsCounters(),
    upstream: fakeUpstream(),
    limits: options.limits,
    treasury: TEST_TREASURY,
    trace,
  };
  const app =
    options.adapter === "cloudflare"
      ? createCloudflareCloud({ deps, modules: options.modules })
      : createVercelCloud({ deps, modules: options.modules });
  const seedRuntime = async (input: {
    id: string;
    state: RuntimeRow["state"];
    stopAfter: string | null;
  }): Promise<void> => {
    await deps.runtimes.insert({
      id: input.id,
      providerId: `sbx:${input.id}`,
      tenantId: "token-alice",
      weight: "light",
      provider: "box",
      state: input.state,
      createdAt: new Date().toISOString(),
      stopAfter: input.stopAfter,
      runtimeToken: `rtk_${input.id}`,
    });
  };
  return { app, deps, events, meterLines, sandbox, seedRuntime };
}
