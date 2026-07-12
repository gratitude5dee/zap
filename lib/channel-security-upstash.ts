import type {
  ChannelLinkCodeRecord,
  ChannelLinkRecord,
  ChannelLinkStore,
} from "./channel-security";
import type { ReplayStore } from "./imessage-bridge-security";

type RedisLike = {
  get<T>(key: string): Promise<T | null>;
  getdel<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { nx?: boolean; px?: number }): Promise<unknown>;
};

export class UpstashChannelLinkStore implements ChannelLinkStore {
  constructor(private readonly redis: RedisLike) {}

  consumeLinkCode(codeHash: string) {
    return this.redis.getdel<ChannelLinkCodeRecord>(`zap:channel:code:${codeHash}`);
  }

  getPrincipalLink(principalKey: string) {
    return this.redis.get<ChannelLinkRecord>(principalLinkKey(principalKey));
  }

  async saveLinkCode(record: ChannelLinkCodeRecord) {
    const ttl = Math.max(1, record.expiresAt - Date.now());
    await this.redis.set(`zap:channel:code:${record.codeHash}`, record, { px: ttl });
  }

  async savePrincipalLink(record: ChannelLinkRecord) {
    await this.redis.set(principalLinkKey(record.principalKey), record);
  }
}

export class UpstashReplayStore implements ReplayStore {
  constructor(
    private readonly redis: RedisLike,
    private readonly now: () => number = Date.now,
  ) {}

  async claim(eventId: string, expiresAtMs: number) {
    const result = await this.redis.set(`zap:channel:replay:${eventId}`, 1, {
      nx: true,
      px: Math.max(1, expiresAtMs - this.now()),
    });
    return result === "OK";
  }
}

export class MemoryChannelLinkStore implements ChannelLinkStore {
  readonly #codes = new Map<string, ChannelLinkCodeRecord>();
  readonly #links = new Map<string, ChannelLinkRecord>();

  async consumeLinkCode(codeHash: string) {
    const record = this.#codes.get(codeHash) ?? null;
    this.#codes.delete(codeHash);
    return record;
  }

  async getPrincipalLink(principalKey: string) {
    return this.#links.get(principalKey) ?? null;
  }

  async saveLinkCode(record: ChannelLinkCodeRecord) {
    this.#codes.set(record.codeHash, record);
  }

  async savePrincipalLink(record: ChannelLinkRecord) {
    this.#links.set(record.principalKey, record);
  }
}

function principalLinkKey(principalKey: string) {
  return `zap:channel:principal:${Buffer.from(principalKey).toString("base64url")}`;
}
