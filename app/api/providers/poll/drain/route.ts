import { NextResponse } from "next/server";
import { cleanupExpiredAirVideoAssets } from "@/lib/air-video-service";
import { recordProviderProgress } from "@/lib/provider-webhooks";
import { deadLetterProviderPoll, dequeueProviderPoll, requeueProviderPoll } from "@/lib/redis";
import { pollGeneration } from "@/lib/providers/router";
import { getRunSnapshot } from "@/lib/run-ledger";
import { revealZapSecretsForProviderByUserId } from "@/lib/supabase/server";
import { listProviderAdapters } from "@wzrdtech/providers";

const providers = listProviderAdapters().map((adapter) => adapter.id);
// Convex invokes this route every two minutes. Thirty retries gives an Air
// Seedance job roughly one hour before deterministic terminal handling.
const maxAttempts = 30;

export async function POST(request: Request) {
  const expectedSecret = process.env.ZAP_POLL_DRAIN_SECRET;
  const providedSecret = request.headers.get("x-zap-cron-secret");
  if ((!expectedSecret && process.env.NODE_ENV === "production") || (expectedSecret && providedSecret !== expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Array<{ provider: string; requestId: string; status: string }> = [];

  for (const provider of providers) {
    for (let index = 0; index < 10; index += 1) {
      const job = await dequeueProviderPoll(provider);
      if (!job) break;

      try {
        const runId = job.payload?.runId;
        const stepId = job.payload?.stepId;
        const owner = runId ? (await getRunSnapshot(runId)).run?.userId : undefined;
        const secrets = await revealZapSecretsForProviderByUserId(provider, owner);
        const result = await pollGeneration(provider, job.requestId, secrets);
        const recorded = await recordProviderProgress(provider, result, {
          capability: job.payload?.capability,
          requestId: job.requestId,
          runId,
          stepId,
        });
        // A terminal provider response is not safe to drop until its durable
        // ledger update succeeds. In particular, a cold Convex failure must
        // leave the job available for the next protected poll invocation.
        if (!recorded.observed) {
          throw new Error(`Provider progress was not persisted (${recorded.reason}).`);
        }

        if (result.status === "queued" || result.status === "running") {
          if ((job.attempts ?? 0) >= maxAttempts) {
            await recordProviderProgress(provider, { error: "POLL_ATTEMPT_LIMIT", status: "failed" }, {
              capability: job.payload?.capability,
              requestId: job.requestId,
              runId,
              stepId,
            });
            await deadLetterProviderPoll(job, "Poll attempt limit exceeded.");
          } else {
            await requeueProviderPoll(provider, job);
          }
        }

        results.push({ provider, requestId: job.requestId, status: result.status });
      } catch (error) {
        if ((job.attempts ?? 0) >= maxAttempts) {
          const runId = job.payload?.runId;
          const stepId = job.payload?.stepId;
          await recordProviderProgress(provider, { error: "POLL_UNAVAILABLE", status: "failed" }, {
            capability: job.payload?.capability,
            requestId: job.requestId,
            runId,
            stepId,
          }).catch(() => undefined);
          await deadLetterProviderPoll(job, "Poll failed.");
        } else {
          await requeueProviderPoll(provider, job);
        }
        results.push({ provider, requestId: job.requestId, status: "retry" });
      }
    }
  }

  const cleanedAssets = await cleanupExpiredAirVideoAssets().catch(() => 0);
  return NextResponse.json({ cleanedAssets, drained: results.length, results });
}
