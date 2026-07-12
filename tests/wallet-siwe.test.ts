import { describe, expect, it } from "vitest";
import {
  createWalletLoginMessage,
  validateWalletLoginPayload,
  type WalletLoginPayload,
} from "../lib/wallet-siwe";
import { resolveThirdwebServerClientOptions } from "../lib/thirdweb-client-options";

const now = new Date("2026-07-10T20:00:00.000Z");
const payload: WalletLoginPayload = {
  address: "0x1111111111111111111111111111111111111111",
  chain_id: "1",
  domain: "zap.wzrd.tech",
  expiration_time: "2026-07-10T20:10:00.000Z",
  invalid_before: "2026-07-10T19:50:00.000Z",
  issued_at: "2026-07-10T20:00:00.000Z",
  nonce: "0x1234567890abcdef",
  statement: "Sign in to Zap Studio and authorize your wallet principal.",
  uri: "https://zap.wzrd.tech",
  version: "1",
};

describe("thirdweb SIWE contract", () => {
  it("prefers a server secret and safely falls back to the public client id", () => {
    expect(resolveThirdwebServerClientOptions({
      NEXT_PUBLIC_THIRDWEB_CLIENT_ID: "client-id",
      THIRDWEB_SECRET_KEY: "server-secret",
    })).toEqual({ secretKey: "server-secret" });
    expect(resolveThirdwebServerClientOptions({
      NEXT_PUBLIC_THIRDWEB_CLIENT_ID: "client-id",
    })).toEqual({ clientId: "client-id" });
    expect(() => resolveThirdwebServerClientOptions({})).toThrow(/thirdweb/i);
  });

  it("creates an EIP-4361 message that binds nonce, domain, URI, and expiry", () => {
    const message = createWalletLoginMessage(payload);
    expect(message).toContain("zap.wzrd.tech wants you to sign in");
    expect(message).toContain(`Nonce: ${payload.nonce}`);
    expect(message).toContain(`URI: ${payload.uri}`);
    expect(message).toContain(`Expiration Time: ${payload.expiration_time}`);
  });

  it("accepts the exact configured envelope", () => {
    expect(validateWalletLoginPayload(payload, {
      domain: "zap.wzrd.tech",
      now,
      uri: "https://zap.wzrd.tech",
    })).toEqual(payload);
  });

  it("rejects replay-friendly or cross-origin payload mutations", () => {
    expect(() => validateWalletLoginPayload({ ...payload, domain: "evil.example" }, {
      domain: "zap.wzrd.tech",
      now,
      uri: "https://zap.wzrd.tech",
    })).toThrow(/domain/i);
    expect(() => validateWalletLoginPayload({ ...payload, nonce: "short" }, {
      domain: "zap.wzrd.tech",
      now,
      uri: "https://zap.wzrd.tech",
    })).toThrow(/nonce/i);
    expect(() => validateWalletLoginPayload({ ...payload, expiration_time: "2026-07-10T19:59:59.000Z" }, {
      domain: "zap.wzrd.tech",
      now,
      uri: "https://zap.wzrd.tech",
    })).toThrow(/expired/i);
  });
});
