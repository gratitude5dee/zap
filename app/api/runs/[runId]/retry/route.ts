import { NextResponse } from "next/server";
import { z } from "zod";
import { retryWaitingZapRun } from "@/lib/zap-runner-server";
import { toZapErrorPayload } from "@/lib/zap-errors";
import { assertRunOwner } from "@/lib/run-request-auth";

const bodySchema = z.object({
  comment: z.string().optional(),
}).default({});

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params;
    await assertRunOwner(request, runId);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const snapshot = await retryWaitingZapRun(runId, body.comment);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json({ error: toZapErrorPayload(error) }, { status: 400 });
  }
}
