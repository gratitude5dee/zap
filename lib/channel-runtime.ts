import { z } from "zod";
import {
  ChannelLinkService,
  channelPrincipalKey,
  normalizeChannelPrincipal,
  type ChannelLinkStore,
  type ChannelPrincipal,
} from "./channel-security";
import {
  MemoryChannelLinkStore,
  UpstashChannelLinkStore,
} from "./channel-security-upstash";
import { getRedis } from "./redis";

export const CHANNEL_WEBHOOK_PATHS = {
  imessage: "/eve/v1/imessage",
  slack: "/eve/v1/slack",
  telegram: "/eve/v1/telegram",
} as const;

export const CHANNEL_REQUIRED_ENV = {
  imessage: ["IMESSAGE_BRIDGE_TOKEN", "IMESSAGE_BRIDGE_URL"],
  slack: ["REDIS_URL", "SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"],
  telegram: ["REDIS_URL", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET_TOKEN", "TELEGRAM_TENANT_ID"],
} as const;

const imessageEventSchema = z.object({
  conversationId: z.string().min(1),
  eventId: z.string().min(1),
  mediaUrls: z.array(z.string().url()).default([]),
  tenantId: z.string().min(1),
  text: z.string().default(""),
  userId: z.string().min(1),
});

export type ImessageBridgeEvent = z.infer<typeof imessageEventSchema>;

export type ChannelSessionAuth = {
  attributes: Readonly<Record<string, string | readonly string[]>>;
  authenticator: string;
  principalId: string;
  principalType: string;
};

export function slackPrincipalFromMessage(message: {
  author?: { userId?: string };
  raw?: { team?: string | { id?: string }; team_id?: string };
}): ChannelPrincipal {
  return normalizeChannelPrincipal({
    adapter: "slack",
    tenantId: message.raw?.team_id
      ?? (typeof message.raw?.team === "string" ? message.raw.team : message.raw?.team?.id)
      ?? "",
    userId: message.author?.userId ?? "",
  });
}

export function telegramPrincipalFromMessage(
  message: { author?: { userId?: string } },
  tenantId = process.env.TELEGRAM_TENANT_ID ?? "",
): ChannelPrincipal {
  return normalizeChannelPrincipal({
    adapter: "telegram",
    tenantId,
    userId: message.author?.userId ?? "",
  });
}

export function parseImessageBridgeEvent(value: unknown) {
  return imessageEventSchema.parse(value);
}

export function imessagePrincipalFromEvent(event: ImessageBridgeEvent): ChannelPrincipal {
  return normalizeChannelPrincipal({ adapter: "imessage", tenantId: event.tenantId, userId: event.userId });
}

const developmentLinkStore = new MemoryChannelLinkStore();
let durableLinkStore: ChannelLinkStore | undefined;

export function getChannelLinkStore(): ChannelLinkStore {
  if (durableLinkStore) return durableLinkStore;
  const redis = getRedis();
  if (redis) {
    durableLinkStore = new UpstashChannelLinkStore(redis);
    return durableLinkStore;
  }
  if (process.env.NODE_ENV !== "production") return developmentLinkStore;
  return unavailableLinkStore;
}

export function getChannelLinkService() {
  const secret = process.env.CHANNEL_LINK_SECRET;
  if (!secret) throw new Error("CHANNEL_LINK_SECRET is required to issue or redeem channel link codes.");
  return new ChannelLinkService({ secret, store: getChannelLinkStore() });
}

export function parseChannelLinkCommand(text: string) {
  const match = text.trim().match(/^\/?link(?:\s+wallet)?\s+([a-z0-9-]{8,})$/i);
  return match?.[1] ?? null;
}

export async function redeemChannelLinkCommand(text: string, principal: ChannelPrincipal) {
  const code = parseChannelLinkCommand(text);
  if (!code) return null;
  const result = await getChannelLinkService().redeemLinkCode({ code, principal });
  return result.ok
    ? { linked: true as const, message: "Wallet linked. Live WZRD Cloud runs are now enabled for this channel identity." }
    : { linked: false as const, message: "That wallet link code is invalid or expired. Generate a new one in Zap Settings." };
}

export function chatPrincipalFromMessage(adapterName: string, message: {
  author?: { userId?: string };
  raw?: { team?: string | { id?: string }; team_id?: string };
}) {
  if (adapterName === "slack") return slackPrincipalFromMessage(message);
  if (adapterName === "telegram") return telegramPrincipalFromMessage(message);
  throw new Error(`Unsupported Chat SDK adapter ${adapterName}.`);
}

export async function resolveChannelSessionAuth(
  principal: ChannelPrincipal,
  store: ChannelLinkStore,
): Promise<ChannelSessionAuth> {
  const normalized = normalizeChannelPrincipal(principal);
  const principalKey = channelPrincipalKey(normalized);
  const link = await store.getPrincipalLink(principalKey);
  if (!link) {
    const attributes: Record<string, string> = {
        channelAdapter: normalized.adapter,
        channelPrincipalKey: principalKey,
        channelTenantId: normalized.tenantId,
        channelUserId: normalized.userId,
    };
    return {
      attributes,
      authenticator: "channel-unlinked",
      principalId: principalKey,
      principalType: "channel" as const,
    };
  }
  const attributes: Record<string, string> = {
      channelAdapter: normalized.adapter,
      channelPrincipalKey: principalKey,
      channelTenantId: normalized.tenantId,
      channelUserId: normalized.userId,
      providerId: "channel-link",
      walletUserId: link.walletUserId,
  };
  return {
    attributes,
    authenticator: "channel-link",
    principalId: link.walletPrincipalId,
    principalType: "user" as const,
  };
}

const unavailableLinkStore: ChannelLinkStore = {
  async consumeLinkCode() { return null; },
  async getPrincipalLink() { return null; },
  async saveLinkCode() { throw new Error("Upstash Redis is required for durable production channel links."); },
  async savePrincipalLink() { throw new Error("Upstash Redis is required for durable production channel links."); },
};
