import { Redis } from "@upstash/redis";

let redis: Redis | null | undefined;
const twoDays = 60 * 60 * 48;

export function getRedis() {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ token, url }) : null;
  return redis;
}

export async function getIdempotencyKey(key: string) {
  const client = getRedis();
  if (!client) return null;
  return client.get<string>(key);
}

export async function setIdempotencyKey(key: string, value: string) {
  const client = getRedis();
  if (!client) return true;
  const result = await client.set(key, value, { ex: twoDays, nx: true });
  return result === "OK";
}

export async function enqueueProviderPoll(provider: string, requestId: string, payload: unknown) {
  const client = getRedis();
  if (!client) return;
  await client.lpush(`zap:poll:${provider}`, JSON.stringify({ payload, requestId, ts: Date.now() }));
}
