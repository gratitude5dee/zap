import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");
const manifestModule = path.join(repoRoot, "lib/agent-manifest.ts");

describe("static agent discovery manifest", () => {
  it("serves one schema-valid definition from both discovery aliases", async () => {
    expect(existsSync(manifestModule), "lib/agent-manifest.ts is missing").toBe(true);

    const loaded = await import(/* @vite-ignore */ pathToFileURL(manifestModule).href) as typeof import("../lib/agent-manifest");
    const parsed = loaded.agentManifestSchema.safeParse(loaded.agentManifest);
    expect(parsed.success).toBe(true);
    expect(loaded.agentManifest.version).toBe("0.3.0");
    expect(loaded.agentManifest.authModes).toEqual(["byok", "wzrd-cloud"]);
    expect(loaded.agentManifest.endpoints.zapCatalog).toBe("/api/zaps");
    expect(loaded.agentManifest.protocols).toEqual({});

    const response = loaded.createAgentManifestResponse();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(loaded.agentManifest);

    const channel = readFileSync(path.join(repoRoot, "agent/channels/public-surfaces.ts"), "utf8");
    expect(channel).toContain('GET("/.agent"');
    expect(channel).toContain('GET("/.well-known/:manifest"');
    expect(channel).toContain('params.manifest === "agent.json"');
    expect(channel).toContain('POST("/zaps/:slug/plan"');
    expect(channel).toContain('POST("/providers/:provider/webhook"');
  });
});
