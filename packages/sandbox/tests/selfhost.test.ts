// Self-host adapter over a recorded zap-agentd — §13 session B / Z4.
import { describe, expect, it } from "vitest";
import { createSelfhostProvider } from "../src/index.ts";

interface Recorded {
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

function makeFetch(): { fetchFn: typeof fetch; requests: Recorded[] } {
  const requests: Recorded[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const req: Recorded = {
      path: `${url.pathname}${url.search}`,
      method: init?.method ?? "GET",
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
      ),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    };
    requests.push(req);
    let body: unknown = { ok: true };
    if (url.pathname === "/v1/exec") body = { exitCode: 0, stdout: "ran", stderr: "" };
    if (url.pathname === "/v1/lane") body = { exitCode: 0, stdout: "lane-ran", stderr: "" };
    if (url.pathname === "/v1/files" && (init?.method ?? "GET") === "GET") body = { content: "data" };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchFn, requests };
}

describe("selfhost adapter", () => {
  it("requires ZAP_SELFHOST_TOKEN", () => {
    expect(() => createSelfhostProvider({ baseUrl: "https://vps.example:8722", token: "" })).toThrow(
      /ZAP_SELFHOST_TOKEN/,
    );
  });

  it("sends the bearer on every call and roots fs at /zap/fs", async () => {
    const { fetchFn, requests } = makeFetch();
    const provider = createSelfhostProvider({ baseUrl: "https://vps.example:8722", token: "vps-secret", fetchFn });
    const handle = await provider.acquire({ provider: "selfhost", purpose: "test", idempotencyKey: "s-1" });
    expect(handle.fs.resolve("a.txt")).toBe("/zap/fs/a.txt");
    await handle.exec("echo hi");
    await handle.fs.read("a.txt");
    for (const request of requests) {
      expect(request.headers.authorization).toBe("Bearer vps-secret");
    }
  });

  it("routes lane exec to /v1/lane with argv and refuses shell strings", async () => {
    const { fetchFn, requests } = makeFetch();
    const provider = createSelfhostProvider({ baseUrl: "https://vps.example:8722", token: "vps-secret", fetchFn });
    const handle = await provider.acquire({ provider: "selfhost", purpose: "test", idempotencyKey: "s-2" });
    await expect(handle.exec("ffprobe in.mp4", { lane: "ffmpeg" })).rejects.toMatchObject({
      code: "LANE_REQUIRES_ARGV",
    });
    const result = await handle.exec(["ffprobe", "-v", "error", "in.mp4"], { lane: "ffmpeg" });
    expect(result.stdout).toBe("lane-ran");
    const lane = requests.find((r) => r.path === "/v1/lane");
    expect(lane?.body?.argv).toEqual(["ffprobe", "-v", "error", "in.mp4"]);
    expect(lane?.body?.lane).toBe("ffmpeg");
  });

  it("release makes the handle unusable", async () => {
    const { fetchFn } = makeFetch();
    const provider = createSelfhostProvider({ baseUrl: "https://vps.example:8722", token: "vps-secret", fetchFn });
    const handle = await provider.acquire({ provider: "selfhost", purpose: "test", idempotencyKey: "s-3" });
    await handle.release();
    await expect(handle.exec("echo hi")).rejects.toMatchObject({ code: "SANDBOX_RELEASED" });
  });
});
