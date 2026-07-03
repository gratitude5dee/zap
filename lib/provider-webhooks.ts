import { getRedis } from "./redis";

export async function recordProviderWebhook(provider: "fal" | "gmi", payload: unknown) {
  const redis = getRedis();
  if (!redis) return;
  await redis.lpush(`zap:webhook:${provider}`, JSON.stringify({ payload, ts: Date.now() }));
}
