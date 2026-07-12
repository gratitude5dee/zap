import { parseSpriteMarkdown } from "@wzrdtech/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSpriteComposioSession } from "@/lib/sprite-composio";
import { getSpriteByAuthor, updateSpriteDeployment, upsertSprite } from "@/lib/sprite-store";
import { deploySpriteToVercel } from "@/lib/sprite-vercel";
import { getRequestAccessToken, resolveWalletPrincipal } from "@/lib/supabase/server";

const bodySchema = z.object({ spriteMd: z.string().min(1).max(100_000) });

export async function POST(request: Request) {
  const principal = await resolveWalletPrincipal(getRequestAccessToken(request));
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { spriteMd } = bodySchema.parse(await request.json());
    const spec = parseSpriteMarkdown(spriteMd);
    const existing = await getSpriteByAuthor(principal.principalId);
    await upsertSprite({
      authorId: principal.principalId,
      composioUserId: principal.userId,
      manifest: spriteMd,
      slug: spec.sprite,
      status: "deploying",
    });
    const composio = await createSpriteComposioSession(spec, principal.userId);
    await upsertSprite({
      authorId: principal.principalId,
      composioMcpUrl: composio?.mcpUrl,
      composioSessionId: composio?.sessionId,
      composioUserId: principal.userId,
      manifest: spriteMd,
      slug: spec.sprite,
      status: "deploying",
    });
    const deployment = await deploySpriteToVercel({
      authorId: principal.principalId,
      composio,
      existing,
      manifest: spriteMd,
      spec,
    });
    await updateSpriteDeployment({
      authorId: principal.principalId,
      composioMcpUrl: composio?.mcpUrl,
      composioSessionId: composio?.sessionId,
      ...deployment,
    });
    return NextResponse.json(deployment, { status: deployment.status === "error" ? 502 : 202 });
  } catch (error) {
    await updateSpriteDeployment({
      authorId: principal.principalId,
      deploymentError: message(error),
      status: "error",
    }).catch(() => undefined);
    return NextResponse.json({ error: message(error) }, { status: 503 });
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Sprite deployment failed.";
}
