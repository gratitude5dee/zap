import { describe, expect, it } from "vitest";
import { assertSpriteZapAllowed, isSpriteChannelEnabled } from "../lib/sprite-runtime";

const manifest = `---
sprite: world-cup
version: 1
description: World Cup runtime.
zaps: [world-cup-entrance]
sandbox: vercel-standard
model: { route: gateway, id: anthropic/claude-sonnet-4.6 }
connections: []
connectors: []
social: []
channels: [slack]
---
`;
const env = { SPRITE_MANIFEST_BASE64: Buffer.from(manifest).toString("base64") };

describe("deployed Sprite runtime scope", () => {
  it("allows only selected zaps and channels", () => {
    expect(() => assertSpriteZapAllowed("world-cup-entrance", env)).not.toThrow();
    expect(() => assertSpriteZapAllowed("caught-by-the-cam", env)).toThrow(/not included/);
    expect(isSpriteChannelEnabled("slack", env)).toBe(true);
    expect(isSpriteChannelEnabled("telegram", env)).toBe(false);
  });

  it("keeps the general Zap deployment unscoped when no Sprite manifest exists", () => {
    expect(() => assertSpriteZapAllowed("caught-by-the-cam", {})).not.toThrow();
    expect(isSpriteChannelEnabled("telegram", {})).toBe(true);
  });
});
