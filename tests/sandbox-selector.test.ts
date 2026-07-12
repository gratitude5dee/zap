import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveManagedSandboxCredential, resolveSandboxBackend } from "../packages/sandbox-adapters/src";

afterEach(() => vi.restoreAllMocks());

describe("Zap sandbox backend selection", () => {
  it.each(["vercel", "box", "daytona", "e2b", "docker", "auto"] as const)("selects %s without recipe changes", (name) => {
    const factory = vi.fn(() => ({ name }));
    const backend = resolveSandboxBackend({ ZAP_SANDBOX_BACKEND: name }, {
      auto: factory,
      box: factory,
      daytona: factory,
      docker: factory,
      e2b: factory,
      vercel: factory,
    });
    expect(backend.name).toBe(name);
    expect(factory).toHaveBeenCalledOnce();
  });

  it("defaults every deployment to ascii Box", () => {
    const backend = resolveSandboxBackend({ VERCEL: "1" }, {
      auto: () => ({ name: "auto" }),
      box: () => ({ name: "box" }),
      daytona: () => ({ name: "daytona" }),
      docker: () => ({ name: "docker" }),
      e2b: () => ({ name: "e2b" }),
      vercel: () => ({ name: "vercel" }),
    });
    expect(backend.name).toBe("box");
  });

  it("rejects unknown configuration instead of silently falling back", () => {
    expect(() => resolveSandboxBackend({ ZAP_SANDBOX_BACKEND: "mystery" })).toThrow(/vercel.*box.*daytona.*e2b.*docker.*auto/i);
  });

  it("resolves the Box service key through the server-authenticated Supabase bridge", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      secrets: { box_api_key: "box_live_managed" },
    }), { status: 200 }));

    await expect(resolveManagedSandboxCredential("box", "box_api_key", {
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable\\n",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co\\n",
      ZAP_SECRET_REVEAL_TOKEN: "server-token\\n",
    })).resolves.toBe("box_live_managed");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.supabase.co/functions/v1/zap-managed-provider-secrets",
      expect.objectContaining({
        body: JSON.stringify({ provider: "box" }),
        headers: expect.objectContaining({ "x-zap-server-secret": "server-token" }),
        method: "POST",
      }),
    );
  });
});
