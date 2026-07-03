import type { Redis } from "@upstash/redis";

export type ProviderPollJob = {
  attempts: number;
  capability?: string;
  provider: string;
  requestId: string;
  runId?: string;
  stepId?: string;
  ts: number;
};

const queuePrefix = "zap:poll";
const deadLetterKey = `${queuePrefix}:dead`;

export function providerQueueKey(provider: string) {
  return `${queuePrefix}:${provider}`;
}

export async function enqueueProviderPoll(
  redis: Redis | null,
  provider: string,
  requestId: string,
  payload: Omit<ProviderPollJob, "attempts" | "provider" | "requestId" | "ts"> = {},
) {
  if (!redis) return false;
  const job: ProviderPollJob = {
    ...payload,
    attempts: 0,
    provider,
    requestId,
    ts: Date.now(),
  };
  await redis.lpush(providerQueueKey(provider), job);
  return true;
}

export async function requeueProviderPoll(redis: Redis | null, job: ProviderPollJob) {
  if (!redis) return false;
  await redis.rpush(providerQueueKey(job.provider), { ...job, attempts: job.attempts + 1, ts: Date.now() });
  return true;
}

export async function deadLetterProviderPoll(redis: Redis | null, job: ProviderPollJob, error?: string) {
  if (!redis) return false;
  await redis.lpush(deadLetterKey, { ...job, error, failedAt: Date.now() });
  return true;
}

export async function dequeueProviderPoll(redis: Redis | null, provider: string) {
  if (!redis) return null;
  return redis.rpop<ProviderPollJob>(providerQueueKey(provider));
}
