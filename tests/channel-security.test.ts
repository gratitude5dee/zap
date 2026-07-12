import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  authorizeChannelRun,
  ChannelLinkService,
  channelPrincipalKey,
  type ChannelLinkCodeRecord,
  type ChannelLinkRecord,
  type ChannelLinkStore,
  type ChannelPrincipal,
} from "../lib/channel-security";
import {
  createImessageBridgeSignature,
  MemoryReplayStore,
  verifyImessageBridgeRequest,
} from "../lib/imessage-bridge-security";

const slackPrincipal: ChannelPrincipal = {
  adapter: "slack",
  tenantId: "T-123",
  userId: "U-456",
};
const linkedWallet = {
  principalId: "wallet:0x1111111111111111111111111111111111111111" as const,
  userId: "wallet-user-1",
};

describe("channel principal identity", () => {
  it("keys a principal by adapter, tenant, and user without cross-tenant collisions", () => {
    expect(channelPrincipalKey(slackPrincipal)).toBe(
      channelPrincipalKey({ adapter: " SLACK ", tenantId: " T-123 ", userId: " U-456 " }),
    );
    expect(channelPrincipalKey(slackPrincipal)).not.toBe(
      channelPrincipalKey({ ...slackPrincipal, tenantId: "T-OTHER" }),
    );
    expect(channelPrincipalKey(slackPrincipal)).not.toBe(
      channelPrincipalKey({ ...slackPrincipal, adapter: "telegram" }),
    );
  });
});

describe("channel link codes", () => {
  it("stores only a keyed hash and consumes the code exactly once", async () => {
    const store = new RecordingChannelLinkStore();
    const service = new ChannelLinkService({
      codeTtlMs: 5 * 60_000,
      now: () => 1_000,
      randomBytes: () => Buffer.from("0011223344556677", "hex"),
      secret: "test-link-secret-that-is-long-enough",
      store,
    });

    const issued = await service.issueLinkCode(linkedWallet);
    const stored = [...store.codes.values()][0];

    expect(issued.code).toBe("0011-2233-4455-6677");
    expect(stored).toMatchObject({
      expiresAt: 301_000,
      walletPrincipalId: linkedWallet.principalId,
      walletUserId: linkedWallet.userId,
    });
    expect(stored?.codeHash).not.toContain(issued.code);
    expect(JSON.stringify(stored)).not.toContain(issued.code);

    const first = await service.redeemLinkCode({ code: issued.code, principal: slackPrincipal });
    const second = await service.redeemLinkCode({ code: issued.code, principal: slackPrincipal });

    expect(first).toMatchObject({ ok: true, link: { walletUserId: "wallet-user-1" } });
    expect(second).toEqual({ ok: false, reason: "invalid_or_expired" });
    await expect(service.getLinkedWallet(slackPrincipal)).resolves.toEqual(linkedWallet);
  });

  it("rejects an expired code without creating a principal link", async () => {
    let now = 10_000;
    const store = new RecordingChannelLinkStore();
    const service = new ChannelLinkService({
      codeTtlMs: 1_000,
      now: () => now,
      randomBytes: () => Buffer.from("ffeeddccbbaa0099", "hex"),
      secret: "test-link-secret-that-is-long-enough",
      store,
    });
    const issued = await service.issueLinkCode({ ...linkedWallet, userId: "wallet-user-2" });
    now = 11_001;

    await expect(service.redeemLinkCode({ code: issued.code, principal: slackPrincipal })).resolves.toEqual({
      ok: false,
      reason: "invalid_or_expired",
    });
    await expect(service.getLinkedWallet(slackPrincipal)).resolves.toBeNull();
  });
});

describe("channel spend authorization", () => {
  it("allows an unlinked channel user to dry-run without granting spend", () => {
    expect(authorizeChannelRun({ credentialMode: "wzrd-cloud", live: false, quoteUsd: 4 })).toEqual({
      allowed: true,
      canSpend: false,
      mode: "dry-run",
    });
  });

  it("denies every live run for an unlinked channel user", () => {
    expect(authorizeChannelRun({ credentialMode: "wzrd-cloud", live: true, quoteUsd: 4 })).toEqual({
      allowed: false,
      reason: "channel_not_linked",
    });
    expect(authorizeChannelRun({ credentialMode: "byok", live: true, quoteUsd: 4 })).toEqual({
      allowed: false,
      reason: "channel_not_linked",
    });
  });

  it("fails closed when a managed cap is unavailable or exhausted", () => {
    expect(authorizeChannelRun({ credentialMode: "wzrd-cloud", linkedWallet, live: true, quoteUsd: 4 })).toEqual({
      allowed: false,
      reason: "managed_cap_unavailable",
    });
    expect(authorizeChannelRun({
      credentialMode: "wzrd-cloud",
      linkedWallet,
      live: true,
      managedDailyRemainingUsd: 3.99,
      quoteUsd: 4,
    })).toEqual({ allowed: false, reason: "managed_daily_cap_exceeded" });
  });

  it("authorizes linked spend only within the supplied durable cap", () => {
    expect(authorizeChannelRun({
      credentialMode: "wzrd-cloud",
      linkedWallet,
      live: true,
      managedDailyRemainingUsd: 4,
      quoteUsd: 4,
    })).toEqual({
      allowed: true,
      canSpend: true,
      credentialMode: "wzrd-cloud",
      mode: "live",
      walletUserId: linkedWallet.userId,
    });
  });
});

describe("iMessage bridge verification", () => {
  it("accepts one fresh signed event and rejects its replay", async () => {
    const rawBody = JSON.stringify({ eventId: "evt-1", text: "hello" });
    const timestamp = "1700000000";
    const secret = "imessage-signing-secret";
    const signature = createImessageBridgeSignature({ eventId: "evt-1", rawBody, secret, timestamp });
    const replayStore = new MemoryReplayStore();
    const request = {
      eventId: "evt-1",
      nowMs: 1_700_000_000_000,
      rawBody,
      replayStore,
      secret,
      signature,
      timestamp,
    };

    await expect(verifyImessageBridgeRequest(request)).resolves.toEqual({ ok: true });
    await expect(verifyImessageBridgeRequest(request)).resolves.toEqual({ ok: false, reason: "replayed" });
  });

  it("rejects tampered and stale events before claiming replay state", async () => {
    const rawBody = "{}";
    const timestamp = "1700000000";
    const secret = "imessage-signing-secret";
    const valid = createHmac("sha256", secret).update(`${timestamp}.evt-2.${rawBody}`).digest("hex");
    const replayStore = new MemoryReplayStore();

    await expect(verifyImessageBridgeRequest({
      eventId: "evt-2",
      nowMs: 1_700_000_000_000,
      rawBody: "{\"tampered\":true}",
      replayStore,
      secret,
      signature: `sha256=${valid}`,
      timestamp,
    })).resolves.toEqual({ ok: false, reason: "invalid_signature" });

    const signature = createImessageBridgeSignature({ eventId: "evt-3", rawBody, secret, timestamp });
    await expect(verifyImessageBridgeRequest({
      eventId: "evt-3",
      nowMs: 1_700_000_301_000,
      rawBody,
      replayStore,
      secret,
      signature,
      timestamp,
    })).resolves.toEqual({ ok: false, reason: "stale" });
  });
});

class RecordingChannelLinkStore implements ChannelLinkStore {
  readonly codes = new Map<string, ChannelLinkCodeRecord>();
  readonly links = new Map<string, ChannelLinkRecord>();

  async consumeLinkCode(codeHash: string) {
    const record = this.codes.get(codeHash) ?? null;
    this.codes.delete(codeHash);
    return record;
  }

  async getPrincipalLink(principalKey: string) {
    return this.links.get(principalKey) ?? null;
  }

  async saveLinkCode(record: ChannelLinkCodeRecord) {
    this.codes.set(record.codeHash, record);
  }

  async savePrincipalLink(record: ChannelLinkRecord) {
    this.links.set(record.principalKey, record);
  }
}
