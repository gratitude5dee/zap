import {
  cdpFacilitator,
  createVercelCloud,
  memoryCloudMeter,
  memoryNonceStore,
  memoryOpsCounters,
  memoryRateLimiter,
  memoryReceiptStore,
  memoryRuntimeStore,
  thirdwebFacilitator,
  type CloudDeps,
  type CloudHono,
  type Facilitator,
  type SandboxProvider,
} from "@wzrdtech/zap-cloud";

export const runtime = "nodejs";

function selectFacilitator(env: Record<string, string | undefined>): Facilitator {
  const thirdwebKey = env.THIRDWEB_SECRET_KEY;
  if (thirdwebKey) return thirdwebFacilitator({ secretKey: thirdwebKey });
  const cdpToken = env.CDP_AUTH_TOKEN;
  if (cdpToken) return cdpFacilitator({ authToken: cdpToken });
  return {
    async verify() {
      throw new Error("No payment facilitator configured.");
    },
    async settle() {
      throw new Error("No payment facilitator configured.");
    },
  };
}

const unavailableSandbox: SandboxProvider = {
  async create() {
    throw new Error("Sandbox provider not configured.");
  },
  async exec() {
    throw new Error("Sandbox provider not configured.");
  },
  async stop() {
    throw new Error("Sandbox provider not configured.");
  },
  async snapshot() {
    throw new Error("Sandbox provider not configured.");
  },
  async fork() {
    throw new Error("Sandbox provider not configured.");
  },
};

let cached: CloudHono | null = null;

function cloudApp(): CloudHono {
  if (cached) return cached;
  const env = process.env;
  const deps: CloudDeps = {
    env,
    runtimes: memoryRuntimeStore(),
    receipts: memoryReceiptStore(),
    nonces: memoryNonceStore(),
    meter: memoryCloudMeter(),
    sandbox: unavailableSandbox,
    facilitator: selectFacilitator(env),
    limiter: memoryRateLimiter(),
    counters: memoryOpsCounters(),
    upstream: {
      async llm() {
        return new Response(JSON.stringify({ error: { message: "Gateway upstream not configured." } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      },
      async media() {
        return new Response(JSON.stringify({ error: { message: "Gateway upstream not configured." } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      },
    },
    treasury: env.ZAP_TREASURY_ADDRESS ?? "",
  };
  cached = createVercelCloud({ deps });
  return cached;
}

function rewrite(request: Request): Request {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/api\/cloud/, "");
  return new Request(url, request);
}

const handler = (request: Request): Promise<Response> => Promise.resolve(cloudApp().fetch(rewrite(request)));

export { handler as GET, handler as POST, handler as PUT, handler as DELETE, handler as PATCH };
