import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/llm-route", () => ({
  assertLlmModelCompatible: () => undefined,
}));

import { spriteEnvironment } from "../lib/sprite-environment";

const originalBoxApiKey = process.env.BOX_API_KEY;
const originalGmiApiKey = process.env.GMI_API_KEY;
const originalGmiOrgId = process.env.GMI_ORG_ID;
const originalProdiaToken = process.env.PRODIA_TOKEN;
const originalRunwareKey = process.env.RUNWARE_KEY;
const originalPluginCatalog = process.env.SPRITE_PLUGIN_CATALOG_JSON;

afterEach(() => {
  if (originalBoxApiKey === undefined) delete process.env.BOX_API_KEY;
  else process.env.BOX_API_KEY = originalBoxApiKey;
  if (originalGmiApiKey === undefined) delete process.env.GMI_API_KEY;
  else process.env.GMI_API_KEY = originalGmiApiKey;
  if (originalGmiOrgId === undefined) delete process.env.GMI_ORG_ID;
  else process.env.GMI_ORG_ID = originalGmiOrgId;
  if (originalProdiaToken === undefined) delete process.env.PRODIA_TOKEN;
  else process.env.PRODIA_TOKEN = originalProdiaToken;
  if (originalRunwareKey === undefined) delete process.env.RUNWARE_KEY;
  else process.env.RUNWARE_KEY = originalRunwareKey;
  if (originalPluginCatalog === undefined) delete process.env.SPRITE_PLUGIN_CATALOG_JSON;
  else process.env.SPRITE_PLUGIN_CATALOG_JSON = originalPluginCatalog;
});

describe("Sprite Vercel deployment environment", () => {
  it("inherits the ascii.dev Box credential for a Box-backed Sprite", () => {
    process.env.BOX_API_KEY = "box_test_key";

    const variables = spriteEnvironment({
      authorId: "wallet:0x1234",
      composio: null,
      manifest: "---\nsprite: test-sprite\n---",
      spec: {
        channels: [],
        connections: [],
        connectors: [],
        description: "Box deployment contract test.",
        model: { id: "anthropic/claude-sonnet-4.6", route: "gateway" },
        sandbox: "box-standard",
        social: [],
        sprite: "test-sprite",
        version: 1,
        zaps: ["test-zap"],
      },
    });

    expect(variables).toContainEqual({
      key: "BOX_API_KEY",
      target: ["production", "preview"],
      type: "sensitive",
      value: "box_test_key",
    });
    expect(variables).toContainEqual(expect.objectContaining({
      key: "ZAP_SANDBOX_BACKEND",
      value: "box",
    }));
    expect(variables).toContainEqual(expect.objectContaining({
      key: "ZAP_SANDBOX_CPU",
      value: "2",
    }));
    expect(variables).toContainEqual(expect.objectContaining({
      key: "ZAP_SANDBOX_MEMORY_MB",
      value: "4096",
    }));
    expect(variables).toContainEqual(expect.objectContaining({
      key: "ZAP_SANDBOX_TIMEOUT_SECONDS",
      value: "900",
    }));
  });

  it("inherits the canonical Prodia and Runware provider credentials", () => {
    process.env.PRODIA_TOKEN = "prodia-test";
    process.env.RUNWARE_KEY = "runware-test";
    const variables = spriteEnvironment({
      authorId: "wallet:0x1234",
      composio: null,
      manifest: "---\nsprite: test-sprite\n---",
      spec: {
        channels: [],
        connections: [],
        connectors: [],
        description: "Provider environment contract test.",
        model: { id: "anthropic/claude-sonnet-4.6", route: "gateway" },
        sandbox: "box-standard",
        social: [],
        sprite: "test-sprite",
        version: 1,
        zaps: ["test-zap"],
      },
    });
    expect(variables).toContainEqual(expect.objectContaining({ key: "PRODIA_TOKEN", value: "prodia-test" }));
    expect(variables).toContainEqual(expect.objectContaining({ key: "RUNWARE_KEY", value: "runware-test" }));
    expect(variables.some((entry) => entry.key === "PRODIA_API_KEY" || entry.key === "RUNWARE_API_KEY")).toBe(false);
  });

  it("inherits only the GMI API key", () => {
    process.env.GMI_API_KEY = "gmi-test-key";
    process.env.GMI_ORG_ID = "legacy-org-id";
    const variables = spriteEnvironment({
      authorId: "wallet:0x1234",
      composio: null,
      manifest: "---\nsprite: test-sprite\n---",
      spec: {
        channels: [],
        connections: [],
        connectors: [],
        description: "GMI provider environment contract test.",
        model: { id: "anthropic/claude-sonnet-4.6", route: "gateway" },
        sandbox: "box-standard",
        social: [],
        sprite: "test-sprite",
        version: 1,
        zaps: ["test-zap"],
      },
    });
    expect(variables).toContainEqual(expect.objectContaining({ key: "GMI_API_KEY", value: "gmi-test-key" }));
    expect(variables.some((entry) => entry.key === "GMI_ORG_ID")).toBe(false);
  });

  it("passes every resolved MCP/plugin connection to the Sprite build", () => {
    process.env.SPRITE_PLUGIN_CATALOG_JSON = JSON.stringify({
      social: { url: "https://social.example/mcp" },
    });
    const variables = spriteEnvironment({
      authorId: "wallet:0x1234",
      composio: null,
      manifest: "---\nsprite: test-sprite\n---",
      spec: {
        channels: [],
        connections: [
          { id: "research", kind: "mcp", url: "https://research.example/mcp" },
          { id: "social", kind: "plugin" },
        ],
        connectors: [],
        description: "Connection environment contract test.",
        model: { id: "anthropic/claude-sonnet-4.6", route: "gateway" },
        sandbox: "box-standard",
        social: [],
        sprite: "test-sprite",
        version: 1,
        zaps: ["test-zap"],
      },
    });
    expect(JSON.parse(variables.find((entry) => entry.key === "SPRITE_RESOLVED_CONNECTIONS")?.value ?? "[]"))
      .toEqual([
        { id: "research", kind: "mcp", url: "https://research.example/mcp" },
        { id: "social", kind: "plugin", url: "https://social.example/mcp" },
      ]);
  });
});
