import { NextResponse } from "next/server";
import { recordProviderProgress } from "@/lib/provider-webhooks";
import { deadLetterProviderPoll, dequeueProviderPoll, requeueProviderPoll } from "@/lib/redis";
import { pollGeneration } from "@/lib/providers/router";
import { getRunSnapshot } from "@/lib/run-ledger";
import { revealZapSecretsForProviderByUserId } from "@/lib/supabase/server";

const providers = ["gmi", "fal", "prodia", "runware"] as const;
const maxAttempts = 24;

export async function POST(request: Request) {
  const expectedSecret = process.env.ZAP_POLL_DRAIN_SECRET;
  const providedSecret = request.headers.get("x-zap-cron-secret");
  if (expectedSecret && providedSecret !== expectedSecret) {
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
        await recordProviderProgress(provider, result, {
          capability: job.payload?.capability,
          requestId: job.requestId,
          runId,
          stepId,
        });

        if (result.status === "queued" || result.status === "running") {
          if ((job.attempts ?? 0) >= maxAttempts) {
            await deadLetterProviderPoll(job, "Poll attempt limit exceeded.");
          } else {
            await requeueProviderPoll(provider, job);
          }
        }

        results.push({ provider, requestId: job.requestId, status: result.status });
      } catch (error) {
        if ((job.attempts ?? 0) >= maxAttempts) {
          await deadLetterProviderPoll(job, error instanceof Error ? error.message : "Poll failed.");
        } else {
          await requeueProviderPoll(provider, job);
        }
        results.push({ provider, requestId: job.requestId, status: "retry" });
      }
    }
  }

  return NextResponse.json({ drained: results.length, results });
}
