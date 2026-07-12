import { describe, expect, it } from "vitest";
import { resolveChannelAwareRunContext } from "../lib/channel-run-context";

const linked = {
  attributes: { walletUserId: "supabase-user-1" },
  authenticator: "channel-link",
  principalId: "wallet:0x1111111111111111111111111111111111111111",
};

describe("channel-aware run context", () => {
  it("keeps unlinked channel turns plan-only", () => {
    const auth = { attributes: {}, authenticator: "channel-unlinked", principalId: "channel-key" };
    expect(resolveChannelAwareRunContext({ auth, live: false })).toEqual({ credentialMode: "byok" });
    expect(() => resolveChannelAwareRunContext({ auth, live: true })).toThrow(/linked wallet/i);
  });

  it("defaults a linked live channel run to WZRD Cloud with its verified wallet identity", () => {
    expect(resolveChannelAwareRunContext({ auth: linked, live: true })).toEqual({
      credentialMode: "wzrd-cloud",
      principalId: linked.principalId,
      userId: "supabase-user-1",
    });
  });

  it("preserves anonymous and self-hosted BYOK behavior", () => {
    expect(resolveChannelAwareRunContext({ live: true })).toEqual({ credentialMode: "byok" });
  });
});
