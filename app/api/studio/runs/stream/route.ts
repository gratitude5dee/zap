import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { NextResponse } from "next/server";
import { convexServiceToken } from "@/lib/convex-service";
import { encodeStudioRunsEvent, STUDIO_RUN_STREAM_LIFETIME_MS } from "@/lib/studio-runs";
import { getRequestAccessToken, resolveWalletPrincipal } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

const listRecentRuns = makeFunctionReference<"query">("runs:listRecent");
const encoder = new TextEncoder();

export async function GET(request: Request) {
  const streamDeadline = Date.now() + STUDIO_RUN_STREAM_LIFETIME_MS;
  const principal = await resolveWalletPrincipal(getRequestAccessToken(request));
  if (!principal) return NextResponse.json({ error: "Wallet sign-in required." }, { status: 401 });
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return NextResponse.json({ error: "Convex is not configured." }, { status: 503 });

  let serviceToken: string;
  try {
    serviceToken = convexServiceToken();
  } catch {
    return NextResponse.json({ error: "Convex service access is not configured." }, { status: 503 });
  }

  let client: ConvexClient;
  try {
    client = new ConvexClient(url);
  } catch {
    return NextResponse.json({ error: "Convex run streaming is unavailable." }, { status: 503 });
  }
  let release = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let released = false;
      let unsubscribe = () => {};
      const write = (event: string) => {
        if (released) return;
        try {
          controller.enqueue(encoder.encode(event));
        } catch {
          release();
        }
      };
      const closeStream = () => {
        release();
        try {
          controller.close();
        } catch {
          // The browser may have canceled the stream first.
        }
      };
      const abort = () => closeStream();
      const heartbeat = setInterval(() => write(": keep-alive\n\n"), 15_000);
      const lifetime = setTimeout(closeStream, Math.max(0, streamDeadline - Date.now()));

      release = () => {
        if (released) return;
        released = true;
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        request.signal.removeEventListener("abort", abort);
        unsubscribe();
        void client.close().catch(() => undefined);
      };

      write("retry: 5000\n: connected\n\n");
      let subscription: ReturnType<typeof client.onUpdate>;
      try {
        subscription = client.onUpdate(
          listRecentRuns,
          { limit: 8, principalId: principal.principalId, serviceToken },
          (rows) => write(encodeStudioRunsEvent(Array.isArray(rows) ? rows : [])),
          () => {
            write(`event: stream-error\ndata: ${JSON.stringify({ error: "Run stream is unavailable." })}\n\n`);
            closeStream();
          },
        );
      } catch {
        write(`event: stream-error\ndata: ${JSON.stringify({ error: "Run stream is unavailable." })}\n\n`);
        closeStream();
        return;
      }
      unsubscribe = subscription;
      if (released) {
        unsubscribe();
      } else {
        request.signal.addEventListener("abort", abort, { once: true });
        if (request.signal.aborted) abort();
      }
    },
    cancel() {
      release();
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-store, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    },
  });
}
