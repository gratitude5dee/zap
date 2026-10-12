import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import type { Message, SlashCommandEvent, Thread } from "chat";
import { chatSdkChannel, messageToUserContent } from "eve/channels/chat-sdk";
import {
  CHANNEL_WEBHOOK_PATHS,
  chatPrincipalFromMessage,
  getChannelLinkStore,
  redeemDirectChannelLinkCommand,
  resolveChannelSessionAuth,
} from "../../lib/channel-runtime";
import { isSpriteChannelEnabled } from "../../lib/sprite-runtime";

// Workers forbid random generation in module global scope; this sentinel only
// disables adapters whose real secrets are unset (prod always provides them).
const disabledCredential = "zap-chat-disabled-no-secret-configured";
const state = process.env.REDIS_URL
  ? createRedisState({ keyPrefix: "zap:chat", url: process.env.REDIS_URL })
  : createMemoryState();

export const { bot, channel, send } = chatSdkChannel({
  adapters: {
    slack: createSlackAdapter({
      botToken: process.env.SLACK_BOT_TOKEN ?? `disabled-${disabledCredential}`,
      signingSecret: process.env.SLACK_SIGNING_SECRET ?? disabledCredential,
      userName: "Zap",
    }),
    telegram: createTelegramAdapter({
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? `disabled-${disabledCredential}`,
      mode: "webhook",
      secretToken: process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN ?? disabledCredential,
      userName: process.env.TELEGRAM_BOT_USERNAME ?? "zap_wzrd_bot",
    }),
  },
  resolveInputAuth: async (event) => {
    const principal = chatPrincipalFromMessage(event.adapter.name, {
      author: event.user,
      raw: asChatRaw(event.raw),
    });
    return resolveChannelSessionAuth(principal, getChannelLinkStore(), {
      isDirectMessage: event.thread?.isDM === true,
    });
  },
  routes: {
    slack: CHANNEL_WEBHOOK_PATHS.slack,
    telegram: CHANNEL_WEBHOOK_PATHS.telegram,
  },
  state,
  streaming: true,
  userName: "Zap",
});

bot.onNewMention(async (thread: Thread, message: Message) => {
  await thread.subscribe();
  await handleMessage(thread, message);
});

bot.onDirectMessage(handleMessage);
bot.onSubscribedMessage(handleMessage);

bot.onSlashCommand("/link", async (event: SlashCommandEvent) => {
  if ((event.adapter.name === "slack" || event.adapter.name === "telegram") && !isSpriteChannelEnabled(event.adapter.name)) {
    await event.channel.post(`${event.adapter.name} is not enabled for this Sprite.`);
    return;
  }
  if (event.adapter.name !== "slack" && event.adapter.name !== "telegram") return;
  const principal = chatPrincipalFromMessage(event.adapter.name, {
    author: event.user,
    raw: asChatRaw(event.raw),
  });
  const result = await redeemDirectChannelLinkCommand({
    isDirectMessage: event.channel.isDM,
    principal,
    text: `/link ${event.text}`,
  });
  await event.channel.post(result?.message ?? "Usage: /link CODE");
});

async function handleMessage(
  thread: Thread,
  message: Message,
) {
  if ((thread.adapter.name === "slack" || thread.adapter.name === "telegram") && !isSpriteChannelEnabled(thread.adapter.name)) {
    await thread.post(`${thread.adapter.name} is not enabled for this Sprite.`);
    return;
  }
  const principal = chatPrincipalFromMessage(thread.adapter.name, {
    author: message.author,
    raw: asChatRaw(message.raw),
  });
  const linkResult = await redeemDirectChannelLinkCommand({
    isDirectMessage: thread.isDM,
    principal,
    text: message.text,
  });
  if (linkResult) {
    await thread.post(linkResult.message);
    return;
  }
  const auth = await resolveChannelSessionAuth(principal, getChannelLinkStore(), {
    isDirectMessage: thread.isDM,
  });
  await send(messageToUserContent(message), {
    auth,
    thread,
    title: `Zap via ${thread.adapter.name}`,
  });
}

function asChatRaw(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  return value as { team?: string | { id?: string }; team_id?: string };
}

export default channel;
