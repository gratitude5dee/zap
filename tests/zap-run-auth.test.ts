import { describe, expect, it } from "vitest";
import { liveRunAuthError } from "../lib/zap-run-auth";

describe("Zap run auth policy", () => {
  it("allows public plan-only runs", () => {
    expect(liveRunAuthError(false)).toBeNull();
  });

  it("requires a Supabase bearer token for live web runs", () => {
    expect(liveRunAuthError(true)).toMatch(/wallet auth/);
    expect(liveRunAuthError(true, "jwt")).toBeNull();
  });
});
