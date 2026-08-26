// Build + lint (C15/C16 enforcement): secret literals, HTTPS origins,
// process.env, async agents; the manifest carries header names only.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildProject, lintProject } from "../src/index.ts";

const fixtures = path.resolve(__dirname, "fixtures", "agents");
const repoRoot = path.resolve(__dirname, "..", "..", "..");

const outDirs: string[] = [];
function outDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "zap-build-"));
  outDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of outDirs) rmSync(dir, { recursive: true, force: true });
});

async function lintCodes(rootDir: string): Promise<string[]> {
  const result = await lintProject({ rootDir });
  return result.errors.map((error) => error.code);
}

describe("build lint", () => {
  it("flags a hard-coded Authorization value as ZAP_BUILD_SECRET_LITERAL", async () => {
    expect(await lintCodes(path.join(fixtures, "bad-secret-literal"))).toContain("ZAP_BUILD_SECRET_LITERAL");
  });

  it("flags an http:// origin as ZAP_BUILD_ORIGIN_NOT_HTTPS", async () => {
    expect(await lintCodes(path.join(fixtures, "bad-http-origin"))).toContain("ZAP_BUILD_ORIGIN_NOT_HTTPS");
  });

  it("flags process.env in a tool as ZAP_BUILD_PROCESS_ENV", async () => {
    expect(await lintCodes(path.join(fixtures, "bad-process-env"))).toContain("ZAP_BUILD_PROCESS_ENV");
  });

  it("flags an async agent as ZAP_BUILD_ASYNC_AGENT", async () => {
    expect(await lintCodes(path.join(fixtures, "bad-async-agent"))).toContain("ZAP_BUILD_ASYNC_AGENT");
  });

  it("flags an undeclared subagent and an undeclared MCP server", async () => {
    const codes = await lintCodes(path.join(fixtures, "bad-undeclared"));
    expect(codes).toContain("ZAP_BUILD_UNDECLARED_SUBAGENT");
    expect(codes).toContain("ZAP_BUILD_UNDECLARED_MCP");
  });

  it("builds the canonical project with a clean manifest (header names only, no values)", async () => {
    const result = await buildProject({ rootDir: repoRoot, outDir: outDir() });
    expect(result.errors).toEqual([]);
    expect(result.manifest.bundleSha).toMatch(/^[0-9a-f]{64}$/);
    const transcode = result.manifest.agents.transcode;
    expect(transcode).toBeDefined();
    expect(transcode?.tools.map((tool) => tool.name)).toContain("ffmpeg_transcode");
    expect(transcode?.connections.map((connection) => connection.id)).toContain("webhook");
    expect(transcode?.connections[0]?.headerNames).toContain("Authorization");
    expect(transcode?.secretsReferenced).toContain("WEBHOOK_TOKEN");
    const researcher = result.manifest.agents.researcher;
    expect(researcher?.mcpServers).toContain("context7");
    expect(researcher?.subagents).toEqual([]);
    expect(researcher?.skills).toContain("summarize");
    const serialized = JSON.stringify(result.manifest);
    expect(serialized).not.toMatch(/Bearer\s+[A-Za-z0-9]/);
    expect(serialized).not.toContain("canary");
  });
});
