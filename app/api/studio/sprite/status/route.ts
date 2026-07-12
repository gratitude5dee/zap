import { NextResponse } from "next/server";
import { getSpriteByAuthor, updateSpriteDeployment } from "@/lib/sprite-store";
import { getSpriteVercelDeployment } from "@/lib/sprite-vercel";
import { getRequestAccessToken, resolveWalletPrincipal } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const principal = await resolveWalletPrincipal(getRequestAccessToken(request));
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sprite = await getSpriteByAuthor(principal.principalId);
    if (!sprite) return NextResponse.json({ sprite: null });
    if (!sprite.deploymentId || sprite.status === "ready") {
      return NextResponse.json(publicStatus(sprite));
    }
    const deployment = await getSpriteVercelDeployment(sprite.deploymentId);
    await updateSpriteDeployment({ authorId: principal.principalId, ...deployment });
    return NextResponse.json({ ...publicStatus(sprite), ...deployment });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 503 });
  }
}

function publicStatus(sprite: { deploymentError?: string; deploymentUrl?: string; slug: string; status: string }) {
  return {
    deploymentError: sprite.deploymentError,
    deploymentUrl: sprite.deploymentUrl,
    slug: sprite.slug,
    status: sprite.status,
  };
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Could not read Sprite deployment status.";
}
