import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { deadLetterProviderPoll, dequeueProviderPoll, requeueProviderPoll } from "@/lib/redis";
import { pollGeneration } from "@/lib/providers/router";

const providers = ["mock", "gmi", "fal"] as const;
const maxAttempts = 24;

export async function POST(request: Request) {
  const expectedSecret = process.env.ZAP_POLL_DRAIN_SECRET;
  const providedSecret = request.headers.get("x-zap-cron-secret");
  if (expectedSecret && providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convex = process.env.NEXT_PUBLIC_CONVEX_URL ? new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL) : null;
  const results: Array<{ provider: string; requestId: string; status: string }> = [];

  for (const provider of providers) {
    for (let index = 0; index < 10; index += 1) {
      const job = await dequeueProviderPoll(provider);
      if (!job) break;

      try {
        const result = await pollGeneration(provider, job.requestId);
        const runId = job.payload?.runId;
        const stepId = job.payload?.stepId;
        if (convex && runId && stepId) {
          await convex.mutation(api.runs.upsertStep, {
            actualUsd: result.actualUsd,
            error: result.error,
            kind: job.payload?.capability ?? "unknown",
            priceQuoteUsd: 0,
            progress: result.progress ?? (result.status === "done" ? 1 : 0),
            provider,
            providerRequestId: job.requestId,
            runId,
            status: result.status === "failed" ? "failed" : result.status === "done" ? "done" : "running",
            stepId,
          });
          if (result.outputUrl) {
            await convex.mutation(api.runs.addAsset, {
              kind: result.outputUrl.endsWith(".wav") ? "wav" : result.outputUrl.endsWith(".png") ? "png" : "mp4",
              parents: [],
              runId,
              stepId,
              url: result.outputUrl,
            });
          }
          if (result.status === "failed") {
            await convex.mutation(api.runs.updateRun, {
              error: result.error,
              runId,
              status: "failed",
            });
          }
        }

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
