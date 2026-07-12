import { describe, expect, it } from "vitest";
import {
  liveRunAuthError,
  sanitizeNextPath,
  zapRunAuthError,
} from "../lib/zap-run-auth";

describe("Zap run auth policy", () => {
  it("allows public plan-only runs", () => {
    expect(liveRunAuthError(false)).toBeNull();
    expect(zapRunAuthError({ credentialMode: "wzrd-cloud", live: false })).toBeNull();
  });

  it("keeps live BYOK and self-hosted runs independent of thirdweb", () => {
    expect(zapRunAuthError({ credentialMode: "byok", live: true })).toBeNull();
    expect(liveRunAuthError(true, undefined, "byok")).toBeNull();
  });

  it("requires a verified wallet principal for managed WZRD Cloud spend", () => {
    expect(zapRunAuthError({ credentialMode: "wzrd-cloud", live: true })).toMatch(/wallet/i);
    expect(zapRunAuthError({
      credentialMode: "wzrd-cloud",
      live: true,
      principalId: "wallet:0x1111111111111111111111111111111111111111",
    })).toBeNull();
  });

  it("only accepts same-origin resume paths", () => {
    expect(sanitizeNextPath("/studio?template=world-cup-entrance")).toBe("/studio?template=world-cup-entrance");
    expect(sanitizeNextPath("https://evil.example/steal")).toBe("/studio");
    expect(sanitizeNextPath("//evil.example/steal")).toBe("/studio");
  });
});
