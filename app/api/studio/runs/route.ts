import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { NextResponse } from "next/server";
import { convexServiceToken } from "@/lib/convex-service";
import { getRequestAccessToken, resolveWalletPrincipal } from "@/lib/supabase/server";

const listRecentRuns = makeFunctionReference<"query">("runs:listRecent");

export async function GET(request: Request) {
  const principal = await resolveWalletPrincipal(getRequestAccessToken(request));
  if (!principal) return NextResponse.json({ error: "Wallet sign-in required." }, { status: 401 });
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return NextResponse.json({ error: "Convex is not configured." }, { status: 503 });

  const client = new ConvexHttpClient(url);
  const rows = await client.query(listRecentRuns, {
    limit: 8,
    principalId: principal.principalId,
    serviceToken: convexServiceToken(),
  }) as Array<any>;

  return NextResponse.json({
    runs: rows.map((entry) => ({
      assets: entry.assets.map((asset: any) => ({ _id: asset._id, kind: asset.kind, stepId: asset.stepId })),
      feedback: entry.feedback.map((feedback: any) => ({
        kind: feedback.kind,
        scores: feedback.scores,
        stepId: feedback.stepId,
      })),
      run: {
        costUsd: entry.run.costUsd,
        runId: entry.run.runId,
        stage: entry.run.stage,
        status: entry.run.status,
        zapSlug: entry.run.zapSlug,
        zapUrl: entry.run.zapUrl,
      },
      steps: entry.steps.map((step: any) => ({
        progress: step.progress,
        status: step.status,
        stepId: step.stepId,
      })),
    })),
  }, { headers: { "cache-control": "no-store" } });
}
