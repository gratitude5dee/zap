import { NextResponse } from "next/server";
import {
  AirVideoServiceError,
  isAirServiceAuthorized,
  parseAirVideoSubmitInput,
  submitAirVideoRun,
} from "@/lib/air-video-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAirServiceAuthorized(request)) return unauthorized();
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) return invalidIdempotencyKey();
  try {
    const result = await submitAirVideoRun(parseAirVideoSubmitInput(await requestJson(request)), idempotencyKey);
    // A first call can legitimately finish as a definitive rejection or an
    // ambiguous submission. Reserve 202 for a known queued/running job so the
    // typed Air client never mistakes a valid terminal response for a broken
    // contract.
    const accepted = result.status === "queued" || result.status === "running";
    return noStore(result, !result.replayed && accepted ? 202 : 200);
  } catch (error) {
    return serviceError(error);
  }
}

async function requestJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AirVideoServiceError("INVALID_REQUEST", 400, false);
  }
}

function unauthorized() {
  return NextResponse.json({ error: { code: "UNAUTHORIZED", retryable: false } }, { status: 401 });
}

function invalidIdempotencyKey() {
  return NextResponse.json({ error: { code: "INVALID_IDEMPOTENCY_KEY", retryable: false } }, { status: 400 });
}

function serviceError(error: unknown) {
  const known = error instanceof AirVideoServiceError
    ? error
    : new AirVideoServiceError("SERVICE_UNAVAILABLE", 503, true);
  return noStore({ error: { code: known.code, retryable: known.retryable } }, known.status);
}

function noStore(payload: unknown, status: number) {
  return NextResponse.json(payload, { headers: { "cache-control": "no-store" }, status });
}
