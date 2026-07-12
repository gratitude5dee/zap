import { createHmac, randomBytes as secureRandomBytes } from "node:crypto";

const defaultCodeTtlMs = 5 * 60_000;

export type ChannelPrincipal = {
  adapter: string;
  tenantId: string;
  userId: string;
};

export type LinkedWalletIdentity = {
  principalId: `wallet:${string}`;
  userId: string;
};

export type ChannelLinkCodeRecord = {
  codeHash: string;
  createdAt: number;
  expiresAt: number;
  walletPrincipalId: `wallet:${string}`;
  walletUserId: string;
};

export type ChannelLinkRecord = {
  linkedAt: number;
  principal: ChannelPrincipal;
  principalKey: string;
  walletPrincipalId: `wallet:${string}`;
  walletUserId: string;
};

export interface ChannelLinkStore {
  consumeLinkCode(codeHash: string): Promise<ChannelLinkCodeRecord | null>;
  getPrincipalLink(principalKey: string): Promise<ChannelLinkRecord | null>;
  saveLinkCode(record: ChannelLinkCodeRecord): Promise<void>;
  savePrincipalLink(record: ChannelLinkRecord): Promise<void>;
}

export type ChannelLinkRedeemResult =
  | { link: ChannelLinkRecord; ok: true }
  | { ok: false; reason: "invalid_or_expired" };

type ChannelLinkServiceOptions = {
  codeTtlMs?: number;
  now?: () => number;
  randomBytes?: () => Uint8Array;
  secret: string;
  store: ChannelLinkStore;
};

export class ChannelLinkService {
  readonly #codeTtlMs: number;
  readonly #now: () => number;
  readonly #randomBytes: () => Uint8Array;
  readonly #secret: string;
  readonly #store: ChannelLinkStore;

  constructor(options: ChannelLinkServiceOptions) {
    if (options.secret.trim().length < 16) {
      throw new Error("Channel link-code secret must be at least 16 characters.");
    }
    this.#codeTtlMs = options.codeTtlMs ?? defaultCodeTtlMs;
    if (!Number.isSafeInteger(this.#codeTtlMs) || this.#codeTtlMs <= 0) {
      throw new Error("Channel link-code TTL must be a positive integer.");
    }
    this.#now = options.now ?? Date.now;
    this.#randomBytes = options.randomBytes ?? (() => secureRandomBytes(8));
    this.#secret = options.secret;
    this.#store = options.store;
  }

  async issueLinkCode(wallet: LinkedWalletIdentity) {
    const normalizedWalletUserId = requiredValue(wallet.userId, "walletUserId");
    const walletPrincipalId = normalizeWalletPrincipalId(wallet.principalId);
    const bytes = Buffer.from(this.#randomBytes());
    if (bytes.byteLength < 8) throw new Error("Channel link codes require at least 64 bits of entropy.");
    const code = formatLinkCode(bytes.toString("hex").toUpperCase());
    const createdAt = this.#now();
    const expiresAt = createdAt + this.#codeTtlMs;
    await this.#store.saveLinkCode({
      codeHash: hashChannelLinkCode(code, this.#secret),
      createdAt,
      expiresAt,
      walletPrincipalId,
      walletUserId: normalizedWalletUserId,
    });
    return { code, expiresAt };
  }

  async redeemLinkCode(input: { code: string; principal: ChannelPrincipal }): Promise<ChannelLinkRedeemResult> {
    const codeHash = hashChannelLinkCode(input.code, this.#secret);
    const codeRecord = await this.#store.consumeLinkCode(codeHash);
    const now = this.#now();
    if (!codeRecord || codeRecord.expiresAt < now) {
      return { ok: false, reason: "invalid_or_expired" };
    }

    const principal = normalizeChannelPrincipal(input.principal);
    const link: ChannelLinkRecord = {
      linkedAt: now,
      principal,
      principalKey: channelPrincipalKey(principal),
      walletPrincipalId: codeRecord.walletPrincipalId,
      walletUserId: codeRecord.walletUserId,
    };
    await this.#store.savePrincipalLink(link);
    return { link, ok: true };
  }

  async getLinkedWallet(principal: ChannelPrincipal) {
    const link = await this.#store.getPrincipalLink(channelPrincipalKey(principal));
    return link
      ? { principalId: link.walletPrincipalId, userId: link.walletUserId } satisfies LinkedWalletIdentity
      : null;
  }
}

export function channelPrincipalKey(principal: ChannelPrincipal) {
  const normalized = normalizeChannelPrincipal(principal);
  return JSON.stringify([normalized.adapter, normalized.tenantId, normalized.userId]);
}

export function normalizeChannelPrincipal(principal: ChannelPrincipal): ChannelPrincipal {
  return {
    adapter: requiredValue(principal.adapter, "adapter").toLowerCase(),
    tenantId: requiredValue(principal.tenantId, "tenantId"),
    userId: requiredValue(principal.userId, "userId"),
  };
}

export function hashChannelLinkCode(code: string, secret: string) {
  const normalized = normalizeLinkCode(code);
  if (!normalized) throw new Error("Channel link code is required.");
  return createHmac("sha256", secret).update(normalized).digest("hex");
}

type ChannelRunAuthorizationInput = {
  credentialMode: "byok" | "wzrd-cloud";
  linkedWallet?: LinkedWalletIdentity | null;
  live: boolean;
  managedDailyRemainingUsd?: number;
  quoteUsd: number;
};

export type ChannelRunAuthorization =
  | { allowed: true; canSpend: false; mode: "dry-run" }
  | {
    allowed: true;
    canSpend: true;
    credentialMode: "byok" | "wzrd-cloud";
    mode: "live";
    walletUserId: string;
  }
  | {
    allowed: false;
    reason: "channel_not_linked" | "managed_cap_unavailable" | "managed_daily_cap_exceeded";
  };

export function authorizeChannelRun(input: ChannelRunAuthorizationInput): ChannelRunAuthorization {
  assertUsd(input.quoteUsd, "quoteUsd");
  if (!input.live) return { allowed: true, canSpend: false, mode: "dry-run" };

  const linkedWallet = input.linkedWallet;
  if (!linkedWallet) return { allowed: false, reason: "channel_not_linked" };
  const walletUserId = requiredValue(linkedWallet.userId, "walletUserId");
  normalizeWalletPrincipalId(linkedWallet.principalId);

  if (input.credentialMode === "wzrd-cloud") {
    if (input.managedDailyRemainingUsd === undefined) {
      return { allowed: false, reason: "managed_cap_unavailable" };
    }
    assertUsd(input.managedDailyRemainingUsd, "managedDailyRemainingUsd");
    if (input.quoteUsd > input.managedDailyRemainingUsd) {
      return { allowed: false, reason: "managed_daily_cap_exceeded" };
    }
  }

  return {
    allowed: true,
    canSpend: true,
    credentialMode: input.credentialMode,
    mode: "live",
    walletUserId,
  };
}

function normalizeLinkCode(code: string) {
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function formatLinkCode(hex: string) {
  return hex.match(/.{1,4}/g)?.join("-") ?? hex;
}

function requiredValue(value: string, name: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Channel principal ${name} is required.`);
  return normalized;
}

function normalizeWalletPrincipalId(value: string): `wallet:${string}` {
  const normalized = value.trim().toLowerCase();
  if (!/^wallet:0x[a-f0-9]{40}$/.test(normalized)) {
    throw new Error("Channel wallet principal must be a verified wallet:0x… identity.");
  }
  return normalized as `wallet:${string}`;
}

function assertUsd(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite non-negative number.`);
}
