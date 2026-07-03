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
  await client.lpush(`zap:poll:${provider}`, { attempts: 0, payload, provider, requestId, ts: Date.now() });
}

export async function dequeueProviderPoll(provider: string) {
  const client = getRedis();
  if (!client) return null;
  return client.rpop<{
    attempts?: number;
    payload?: {
      capability?: string;
      runId?: string;
      stepId?: string;
    };
    provider: string;
    requestId: string;
    ts: number;
  }>(`zap:poll:${provider}`);
}

export async function requeueProviderPoll(provider: string, job: unknown) {
  const client = getRedis();
  if (!client) return;
  const payload = typeof job === "object" && job !== null ? job : { job };
  const attempts = "attempts" in payload && typeof payload.attempts === "number" ? payload.attempts + 1 : 1;
  await client.rpush(`zap:poll:${provider}`, { ...payload, attempts, ts: Date.now() });
}

export async function deadLetterProviderPoll(job: unknown, error?: string) {
  const client = getRedis();
  if (!client) return;
  await client.lpush("zap:poll:dead", { error, failedAt: Date.now(), job });
}
