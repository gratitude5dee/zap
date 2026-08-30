import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseSpriteMarkdown,
  resolveSpriteSandboxPreset,
  serializeSpriteMarkdown,
  SPRITE_WIZARD_STEPS,
} from "../packages/core/src/sprite";

const manifest = `---
sprite: world-cup
version: 1
description: World Cup creator runtime.
zaps: [world-cup-entrance]
sandbox: vercel-standard
model:
  route: gateway
  id: anthropic/claude-sonnet-4.6
connections:
  - kind: mcp
    id: research
    url: https://mcp.example.com
connectors: [notion]
social: [instagram]
channels: [slack]
---

# World Cup
`;

const unitreeManifest = readFileSync("agent/sprites/unitree-g1/Sprite.md", "utf8");

describe("Sprite manifest", () => {
  it("defines exactly the six requested wizard dimensions", () => {
    expect(SPRITE_WIZARD_STEPS).toEqual([
      "sandbox",
      "model",
      "connections",
      "connectors",
      "social",
      "channels",
    ]);
  });

  it("parses, serializes, and resolves a predefined sandbox preset", () => {
    const parsed = parseSpriteMarkdown(manifest);
    expect(parsed).toMatchObject({
      channels: ["slack"],
      connectors: ["notion"],
      sandbox: "vercel-standard",
      social: ["instagram"],
      sprite: "world-cup",
      zaps: ["world-cup-entrance"],
    });
    expect(parseSpriteMarkdown(serializeSpriteMarkdown(parsed))).toEqual(parsed);
    expect(resolveSpriteSandboxPreset(parsed.sandbox)).toMatchObject({ backend: "vercel", memoryMb: 4096 });
  });

  it("parses the unitree-g1 manifest onto a compute-capable sandbox", () => {
    const parsed = parseSpriteMarkdown(unitreeManifest);
    expect(parsed).toMatchObject({
      channels: ["slack"],
      connections: [],
      connectors: [],
      social: [],
      sprite: "unitree-g1",
      version: 1,
      zaps: ["unitree-g1"],
    });
    expect(["daytona-standard", "e2b-standard"]).toContain(parsed.sandbox);
    expect(parseSpriteMarkdown(serializeSpriteMarkdown(parsed))).toEqual(parsed);
    const preset = resolveSpriteSandboxPreset(parsed.sandbox);
    expect(preset.backend).not.toBe("box");
    expect(preset).toMatchObject({ cpu: 2, memoryMb: 4096 });
  });

  it("rejects missing dimensions, duplicate choices, and unscoped MCP connections", () => {
    expect(() => parseSpriteMarkdown(manifest.replace("channels: [slack]", ""))).toThrow(/channels/i);
    expect(() => parseSpriteMarkdown(manifest.replace("channels: [slack]", "channels: [slack, slack]"))).toThrow(/Duplicate Sprite channel/);
    expect(() => parseSpriteMarkdown(manifest.replace("    url: https://mcp.example.com\n", ""))).toThrow(/MCP connections require a URL/);
  });
});
