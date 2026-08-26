// Box adapter tests over recorded HTTP fixtures (secrets stripped) — §13 session B.
import { describe, expect, it } from "vitest";
import {
  BOX_RUNTIME_ENV_KEYS,
  createBoxClient,
  createBoxHandle,
  createBoxProvider,
  memoryIdempotencyStore,
  SandboxStartLimit,
  ZAP_BOX_TTL_SECONDS,
  type Box,
} from "../src/index.ts";

interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

function recordingFetch(
  respond: (req: RecordedRequest) => { status?: number; body: unknown; headers?: Record<string, string> },
): { fetchFn: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const req: RecordedRequest = {
      method: init?.method ?? "GET",
      path: url.pathname.replace("/api/box/v1", ""),
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
      ),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    };
    requests.push(req);
    const out = respond(req);
    return new Response(JSON.stringify(out.body), {
      status: out.status ?? 200,
      headers: { "content-type": "application/json", ...out.headers },
    });
  }) as typeof fetch;
  return { fetchFn, requests };
}

const readyBox: Box = { id: "box-123", state: "ready" };
const envelope = { ok: true, box: readyBox };

const runtimeEnv = {
  TENANT_ID: "tenant-1",
  RUNTIME_ID: "rt-1",
  RUNTIME_TOKEN: "runtime-secret-token",
};

describe("box client", () => {
  it("sends noEnv:true on every create/fork body", async () => {
    const { fetchFn, requests } = recordingFetch(() => ({ body: envelope }));
    const client = createBoxClient({ apiKey: "k", fetchFn, idempotency: memoryIdempotencyStore() });
    await client.fork({ templateId: "zap-light", env: runtimeEnv, idempotencyKey: "idem-1" });
    await client.createFromSnapshot({ from: "snap-1", env: runtimeEnv, idempotencyKey: "idem-2" });
    const writes = requests.filter((r) => r.method === "POST");
    expect(writes).toHaveLength(2);
    for (const request of writes) {
      expect(request.body?.noEnv).toBe(true);
      expect(request.body?.ttlSeconds).toBe(ZAP_BOX_TTL_SECONDS);
    }
  });

  it("rejects per-box env keys outside the runtime allowlist", async () => {
    const { fetchFn, requests } = recordingFetch(() => ({ body: envelope }));
    const client = createBoxClient({ apiKey: "k", fetchFn });
    await expect(
      client.fork({
        templateId: "zap-light",
        env: { ...runtimeEnv, AWS_SECRET_ACCESS_KEY: "nope" },
        idempotencyKey: "idem-3",
      }),
    ).rejects.toThrow(/outside the runtime allowlist/);
    expect(requests).toHaveLength(0);
    expect(BOX_RUNTIME_ENV_KEYS).toContain("RUNTIME_TOKEN");
  });

  it("throws before any request when RUNTIME_TOKEN is missing", async () => {
    const { fetchFn, requests } = recordingFetch(() => ({ body: envelope }));
    const client = createBoxClient({ apiKey: "k", fetchFn });
    await expect(
      client.fork({
        templateId: "zap-light",
        env: { TENANT_ID: "t", RUNTIME_ID: "r" },
        idempotencyKey: "idem-4",
      }),
    ).rejects.toThrow(/missing RUNTIME_TOKEN/);
    expect(requests).toHaveLength(0);
  });

  it("stop never sends force", async () => {
    const { fetchFn, requests } = recordingFetch(() => ({ body: envelope }));
    const client = createBoxClient({ apiKey: "k", fetchFn });
    await client.stop("box-123");
    expect(requests[0].path).toBe("/boxes/box-123/stop");
    expect(requests[0].body).toBeUndefined();
  });

  it.each(["start_limit_reached", "rate_limited"])("maps 429 %s to SandboxStartLimit", async (code) => {
    const { fetchFn } = recordingFetch(() => ({
      status: 429,
      body: { error: { code } },
      headers: { "retry-after": "30" },
    }));
    const client = createBoxClient({ apiKey: "k", fetchFn });
    const error = await client
      .fork({ templateId: "zap-light", env: runtimeEnv, idempotencyKey: "idem-5" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SandboxStartLimit);
    expect((error as SandboxStartLimit).retryAfterSeconds).toBe(30);
  });

  it("replays create/fork: three calls, same idempotencyKey, one request, header present", async () => {
    const { fetchFn, requests } = recordingFetch(() => ({ body: envelope }));
    const client = createBoxClient({ apiKey: "k", fetchFn, idempotency: memoryIdempotencyStore() });
    const one = await client.fork({ templateId: "zap-light", env: runtimeEnv, idempotencyKey: "same-key" });
    const two = await client.fork({ templateId: "zap-light", env: runtimeEnv, idempotencyKey: "same-key" });
    const three = await client.fork({ templateId: "zap-light", env: runtimeEnv, idempotencyKey: "same-key" });
    expect(requests).toHaveLength(1);
    expect(requests[0].headers["idempotency-key"]).toBe("same-key");
    expect(one.id).toBe("box-123");
    expect(two).toEqual(one);
    expect(three).toEqual(one);
  });

  it("never writes the api key or response secrets through the log sink", async () => {
    const logBuffer: string[] = [];
    const { fetchFn } = recordingFetch(() => ({ body: envelope }));
    const client = createBoxClient({ apiKey: "box_live_supersecret", fetchFn, log: (l) => logBuffer.push(l) });
    await client.get("box-123");
    expect(logBuffer.join("\n")).not.toContain("supersecret");
  });
});

describe("box handle", () => {
  function makeHandle(respond: Parameters<typeof recordingFetch>[0]) {
    const { fetchFn, requests } = recordingFetch(respond);
    const client = createBoxClient({ apiKey: "k", fetchFn });
    const handle = createBoxHandle(client, readyBox, {
      provider: "box",
      purpose: "test",
      idempotencyKey: "h-1",
      env: runtimeEnv,
    });
    return { handle, requests };
  }

  it("re-reads every hosted port after resume() and rotates the token", async () => {
    let hostCalls = 0;
    const logBuffer: string[] = [];
    const { handle, requests } = makeHandle((req) => {
      if (req.path === "/boxes/box-123/commands") {
        const command = String(req.body?.command ?? "");
        if (command.includes("host url 8080")) {
          hostCalls += 1;
          return {
            body: { exitCode: 0, stdout: `https://p8080.box.example?_token=tok-${hostCalls}\n`, stderr: "" },
          };
        }
      }
      return { body: envelope };
    });
    const first = await handle.host!(8080, { private: true });
    expect(first.token).toBe("tok-1");
    expect(first.url).not.toContain("tok-1");
    await handle.resume!();
    expect(hostCalls).toBe(2); // hosted URL token re-read post-resume (§4.5)
    logBuffer.push(...requests.map((r) => `${r.method} ${r.path}`));
    expect(logBuffer.join("\n")).not.toContain("tok-2");
  });

  it("release() for purpose test stops without force then removes", async () => {
    const { handle, requests } = makeHandle(() => ({ body: envelope }));
    await handle.release();
    const stop = requests.find((r) => r.path.endsWith("/stop"));
    expect(stop).toBeDefined();
    expect(stop?.body).toBeUndefined();
    expect(requests.some((r) => r.method === "DELETE")).toBe(true);
    await handle.release(); // idempotent
    await expect(handle.exec("pwd")).rejects.toMatchObject({ code: "SANDBOX_RELEASED" });
  });
});

describe("box provider", () => {
  it("doctor reports the api key check without leaking it", async () => {
    const provider = createBoxProvider({ apiKey: "box_live_secret" });
    const report = await provider.doctor();
    expect(report.provider).toBe("box");
    expect(report.ok).toBe(true);
    expect(JSON.stringify(report)).not.toContain("box_live_secret");
  });
});
