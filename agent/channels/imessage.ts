import { defineChannel, POST } from "eve/channels";
import {
  CHANNEL_WEBHOOK_PATHS,
  getChannelLinkStore,
  imessagePrincipalFromEvent,
  parseImessageBridgeEvent,
  redeemChannelLinkCommand,
  resolveChannelSessionAuth,
} from "../../lib/channel-runtime";
import { UpstashReplayStore } from "../../lib/channel-security-upstash";
import {
  MemoryReplayStore,
  verifyImessageBridgeRequest,
  type ReplayStore,
} from "../../lib/imessage-bridge-security";
import { getRedis } from "../../lib/redis";
import { isSpriteChannelEnabled } from "../../lib/sprite-runtime";

type ImessageChannelState = {
  conversationId: string | null;
};

const memoryReplayStore = new MemoryReplayStore();
let replayStore: ReplayStore | undefined;

export default defineChannel<ImessageChannelState, { state: ImessageChannelState }>({
  context(state) {
    return { state };
  },
  events: {
    async "message.completed"(event, channel) {
      if (!event.message || !channel.state.conversationId || event.finishReason === "tool-calls") return;
      await postImessageBridgeMessage(channel.state.conversationId, event.message);
    },
    async "turn.failed"(_event, channel) {
      if (channel.state.conversationId) {
        await postImessageBridgeMessage(channel.state.conversationId, "Zap could not complete that request. Please try again.");
      }
    },
  },
  routes: [
    POST(CHANNEL_WEBHOOK_PATHS.imessage, async (request, { send }) => {
      if (!isSpriteChannelEnabled("imessage")) return new Response("Not found", { status: 404 });
      const secret = process.env.IMESSAGE_BRIDGE_TOKEN;
      if (!secret) return Response.json({ error: "iMessage bridge is not configured." }, { status: 503 });

      const rawBody = await request.text();
      const eventId = request.headers.get("x-imessage-event-id") ?? "";
      const signature = request.headers.get("x-imessage-signature") ?? "";
      const timestamp = request.headers.get("x-imessage-timestamp") ?? "";
      const verified = await verifyImessageBridgeRequest({
        eventId,
        rawBody,
        replayStore: getReplayStore(),
        secret,
        signature,
        timestamp,
      });
      if (!verified.ok) return Response.json({ error: verified.reason }, { status: 401 });

      try {
        const event = parseImessageBridgeEvent(JSON.parse(rawBody));
        if (event.eventId !== eventId) return Response.json({ error: "event_id_mismatch" }, { status: 400 });
        const principal = imessagePrincipalFromEvent(event);
        const linkResult = await redeemChannelLinkCommand(event.text, principal);
        if (linkResult) {
          await postImessageBridgeMessage(event.conversationId, linkResult.message);
          return Response.json({ linked: linkResult.linked, ok: true });
        }
        const auth = await resolveChannelSessionAuth(principal, getChannelLinkStore());
        const session = await send(imessageContent(event.text, event.mediaUrls), {
          auth,
          continuationToken: `${event.tenantId}:${event.conversationId}`,
          state: { conversationId: event.conversationId },
          title: "Zap via iMessage",
        });
        return Response.json({ ok: true, sessionId: session.id }, { status: 202 });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Invalid iMessage bridge event." },
          { status: 400 },
        );
      }
    }),
  ],
  state: { conversationId: null },
});

function getReplayStore() {
  if (replayStore) return replayStore;
  const redis = getRedis();
  replayStore = redis ? new UpstashReplayStore(redis) : memoryReplayStore;
  return replayStore;
}

function imessageContent(text: string, mediaUrls: string[]) {
  if (mediaUrls.length === 0) return text;
  return [
    ...(text ? [{ text, type: "text" as const }] : []),
    ...mediaUrls.map((url) => ({
      data: new URL(url),
      mediaType: "application/octet-stream",
      type: "file" as const,
    })),
  ];
}

async function postImessageBridgeMessage(conversationId: string, text: string) {
  const url = process.env.IMESSAGE_BRIDGE_URL;
  const token = process.env.IMESSAGE_BRIDGE_TOKEN;
  if (!url || !token) throw new Error("IMESSAGE_BRIDGE_URL and IMESSAGE_BRIDGE_TOKEN are required for iMessage delivery.");
  const response = await fetch(url, {
    body: JSON.stringify({ conversationId, text }),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) throw new Error(`iMessage bridge delivery failed with ${response.status}.`);
}
