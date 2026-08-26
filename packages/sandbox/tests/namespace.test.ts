// Namespace adapter (recorded) — §13 session B / Z4 acceptance.
import { describe, expect, it } from "vitest";
import { createNamespaceProvider, NAMESPACE_IAM_API } from "../src/index.ts";

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

function makeFetch(): { fetchFn: typeof fetch; requests: Recorded[] } {
  const requests: Recorded[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const req: Recorded = {
      url,
      method: init?.method ?? "GET",
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
      ),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    };
    requests.push(req);
    let body: unknown = {};
    if (url.includes("IssueIngressAccessToken")) body = { token: "ingress-token-1" };
    else if (url.includes("CreateInstance")) body = { instanceId: "inst-1", status: "RUNNING" };
    else if (url.includes("DescribeInstance")) body = { instanceId: "inst-1", status: "RUNNING" };
    else if (url.includes("CreateIngress")) body = { url: "https://inst-1.ingress.example" };
    else if (url.includes("/v1/files")) body = { content: "hello" };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchFn, requests };
}

const env = { TENANT_ID: "t", RUNTIME_ID: "r", RUNTIME_TOKEN: "bridge-secret" };

describe("namespace adapter", () => {
  it("asserts TENANT_ID/RUNTIME_ID/RUNTIME_TOKEN in per-instance env before any request", async () => {
    const { fetchFn, requests } = makeFetch();
    const provider = createNamespaceProvider({ region: "us", token: "nsc", imageRef: "zap-heavy", fetchFn });
    await expect(
      provider.acquire({
        provider: "namespace",
        purpose: "test",
        idempotencyKey: "n-1",
        env: { TENANT_ID: "t", RUNTIME_ID: "r" },
      }),
    ).rejects.toThrow(/RUNTIME_TOKEN/);
    expect(requests).toHaveLength(0);
  });

  it("bridge requests carry both x-nsc-ingress-auth and X-Zap-Bridge-Token", async () => {
    const { fetchFn, requests } = makeFetch();
    const provider = createNamespaceProvider({ region: "us", token: "nsc", imageRef: "zap-heavy", fetchFn });
    const handle = await provider.acquire({ provider: "namespace", purpose: "test", idempotencyKey: "n-2", env });
    await handle.fs.read("hello.txt");
    const bridge = requests.find((r) => r.url.includes("/v1/files"));
    expect(bridge).toBeDefined();
    expect(bridge?.headers["x-nsc-ingress-auth"]).toBe("ingress-token-1");
    expect(bridge?.headers["x-zap-bridge-token"]).toBe("bridge-secret");
  });

  it("IssueIngressAccessToken goes to NAMESPACE_IAM_API and is cached", async () => {
    const { fetchFn, requests } = makeFetch();
    const provider = createNamespaceProvider({ region: "us", token: "nsc", imageRef: "zap-heavy", fetchFn });
    const handle = await provider.acquire({ provider: "namespace", purpose: "test", idempotencyKey: "n-3", env });
    await handle.fs.read("a.txt");
    await handle.fs.read("b.txt");
    const iam = requests.filter((r) => r.url.startsWith(NAMESPACE_IAM_API));
    expect(iam).toHaveLength(1);
    expect(iam[0].url).toContain("IssueIngressAccessToken");
  });

  it("doctor reports unverified RPCs unless feature-flagged", async () => {
    const provider = createNamespaceProvider({ region: "us", token: "nsc", imageRef: "zap-heavy" });
    const report = await provider.doctor();
    const rpcs = report.checks.find((c) => c.id === "namespace.rpcs");
    expect(rpcs?.ok).toBe(false);
    expect(rpcs?.detail).toContain("unverified");
    const flagged = createNamespaceProvider({ region: "us", token: "nsc", imageRef: "zap-heavy", allowUnverifiedRpcs: true });
    const flaggedReport = await flagged.doctor();
    expect(flaggedReport.checks.find((c) => c.id === "namespace.rpcs")?.ok).toBe(true);
  });
});
