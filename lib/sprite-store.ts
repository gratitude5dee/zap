import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export type SpriteRecord = {
  authorId: string;
  composioMcpUrl?: string;
  composioSessionId?: string;
  composioUserId: string;
  deploymentError?: string;
  deploymentId?: string;
  deploymentUrl?: string;
  manifest: string;
  projectId?: string;
  projectName?: string;
  slug: string;
  status: "draft" | "deploying" | "ready" | "error";
  updatedAt?: number;
};

const getByAuthor = makeFunctionReference<"query">("sprites:getByAuthor");
const upsert = makeFunctionReference<"mutation">("sprites:upsert");
const updateDeployment = makeFunctionReference<"mutation">("sprites:updateDeployment");

export async function getSpriteByAuthor(authorId: string) {
  return await client().query(getByAuthor, {
    authorId,
    serviceToken: serviceToken(),
  }) as SpriteRecord | null;
}

export async function upsertSprite(input: Pick<SpriteRecord,
  "authorId" | "composioMcpUrl" | "composioSessionId" | "composioUserId" | "manifest" | "slug" | "status"
>) {
  return await client().mutation(upsert, { ...input, serviceToken: serviceToken() }) as string;
}

export async function updateSpriteDeployment(input: Pick<SpriteRecord, "authorId" | "status"> & Partial<Pick<SpriteRecord,
  "composioMcpUrl" | "composioSessionId" | "deploymentError" | "deploymentId" | "deploymentUrl" | "projectId" | "projectName"
>>) {
  await client().mutation(updateDeployment, { ...input, serviceToken: serviceToken() });
}

function client() {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is required for Sprite storage.");
  return new ConvexHttpClient(url);
}

function serviceToken() {
  const token = process.env.ZAP_CONVEX_SERVICE_TOKEN;
  if (!token) throw new Error("ZAP_CONVEX_SERVICE_TOKEN is required for server-owned Convex writes.");
  return token;
}
