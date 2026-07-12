import { parseSpriteMarkdown } from "@wzrdtech/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAccessToken, resolveWalletPrincipal } from "@/lib/supabase/server";
import { getSpriteByAuthor, upsertSprite, type SpriteRecord } from "@/lib/sprite-store";

const bodySchema = z.object({ spriteMd: z.string().min(1).max(100_000) });

export async function GET(request: Request) {
  const principal = await resolveWalletPrincipal(getRequestAccessToken(request));
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ sprite: publicSprite(await getSpriteByAuthor(principal.principalId)) });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const principal = await resolveWalletPrincipal(getRequestAccessToken(request));
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { spriteMd } = bodySchema.parse(await request.json());
    const spec = parseSpriteMarkdown(spriteMd);
    const id = await upsertSprite({
      authorId: principal.principalId,
      composioUserId: principal.userId,
      manifest: spriteMd,
      slug: spec.sprite,
      status: "draft",
    });
    return NextResponse.json({ id, spec, status: "draft" });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
}

function publicSprite(sprite: SpriteRecord | null) {
  if (!sprite) return null;
  return {
    deploymentError: sprite.deploymentError,
    deploymentUrl: sprite.deploymentUrl,
    manifest: sprite.manifest,
    slug: sprite.slug,
    status: sprite.status,
    updatedAt: sprite.updatedAt,
  };
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Sprite request failed.";
}
