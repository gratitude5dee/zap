import { NextResponse } from "next/server";
import { AirVideoServiceError, getAirVideoRun, isAirServiceAuthorized } from "@/lib/air-video-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  if (!isAirServiceAuthorized(request)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", retryable: false } }, { status: 401 });
  }
  try {
    const { runId } = await context.params;
    const result = await getAirVideoRun(runId);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const known = error instanceof AirVideoServiceError
      ? error
      : new AirVideoServiceError("SERVICE_UNAVAILABLE", 503, true);
    return NextResponse.json(
      { error: { code: known.code, retryable: known.retryable } },
      { headers: { "cache-control": "no-store" }, status: known.status },
    );
  }
}
