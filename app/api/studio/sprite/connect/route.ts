import { parseSpriteMarkdown } from "@wzrdtech/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeSpriteToolkit } from "@/lib/sprite-composio";
import { getSpriteByAuthor } from "@/lib/sprite-store";
import { getRequestAccessToken, resolveWalletPrincipal } from "@/lib/supabase/server";

const bodySchema = z.object({ toolkit: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,127}$/) });

export async function POST(request: Request) {
  const principal = await resolveWalletPrincipal(getRequestAccessToken(request));
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { toolkit } = bodySchema.parse(await request.json());
    const sprite = await getSpriteByAuthor(principal.principalId);
    if (!sprite?.composioSessionId) throw new Error("Deploy or validate a connector-enabled Sprite first.");
    const spec = parseSpriteMarkdown(sprite.manifest);
    if (![...spec.connectors, ...spec.social].includes(toolkit)) throw new Error("Toolkit is not selected by this Sprite.");
    const callbackUrl = new URL("/studio?composio=connected", request.url).toString();
    return NextResponse.json(await authorizeSpriteToolkit({
      callbackUrl,
      sessionId: sprite.composioSessionId,
      toolkit,
    }));
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Could not connect Sprite toolkit.";
}
