import { promises as fs } from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { parseZapMarkdown, publicZapSpec, type PublicZapSpec, type ZapSpec } from "./zap-schema";

const skillsDir = path.join(process.cwd(), "agent", "skills");
const getZapBySlug = makeFunctionReference<"query">("zaps:getBySlug");
const listZaps = makeFunctionReference<"query">("zaps:list");
const publishedPromptBundles = new Map<string, Record<string, string>>();

export async function loadZapFromSkill(slug: string): Promise<PublicZapSpec | null> {
  const spec = await loadZapSpec(slug);
  return spec ? publicZapSpec(spec) : null;
}

export async function loadZapSpec(slug: string): Promise<ZapSpec | null> {
  const published = await loadPublishedZapSpec(slug);
  if (published) return published;
  const file = path.join(skillsDir, `zap-${slug}`, "Zap.md");
  try {
    return parseZapMarkdown(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listZapSpecs(): Promise<PublicZapSpec[]> {
  const published = await listPublishedZapSpecs();
  const entries = await fs.readdir(skillsDir, { withFileTypes: true }).catch(() => []);
  const zaps = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("zap-"))
    .map((entry) => loadZapFromSkill(entry.name.slice("zap-".length))));
  return zaps
    .concat(published)
    .filter((zap): zap is PublicZapSpec => Boolean(zap))
    .filter((zap, index, all) => all.findIndex((candidate) => candidate.zap === zap.zap) === index)
    .sort((left, right) => left.title.localeCompare(right.title));
}

export async function readPrompt(slug: string, promptPath?: string) {
  if (!promptPath) return "";
  const publishedPrompt = publishedPromptBundles.get(slug)?.[promptPath];
  if (publishedPrompt !== undefined) return publishedPrompt;
  const file = path.join(skillsDir, `zap-${slug}`, promptPath);
  return fs.readFile(file, "utf8");
}

async function loadPublishedZapSpec(slug: string) {
  const client = getConvexClient();
  if (!client) return null;
  try {
    const row = await client.query(getZapBySlug, { slug }) as { source?: string; status?: string } | null;
    if (!row || row.status !== "published" || !row.source) return null;
    return parsePublishedSource(slug, row.source);
  } catch {
    return null;
  }
}

async function listPublishedZapSpecs() {
  const client = getConvexClient();
  if (!client) return [];
  try {
    const rows = await client.query(listZaps, { status: "published" }) as Array<{ slug: string; source?: string }>;
    return rows.flatMap((row) => {
      if (!row.source) return [];
      const spec = parsePublishedSource(row.slug, row.source);
      return spec ? [publicZapSpec(spec)] : [];
    });
  } catch {
    return [];
  }
}

function parsePublishedSource(slug: string, source: string) {
  try {
    const parsed = JSON.parse(source) as { prompts?: Record<string, string>; zapMd?: string };
    if (!parsed.zapMd) return null;
    publishedPromptBundles.set(slug, parsed.prompts ?? {});
    return parseZapMarkdown(parsed.zapMd);
  } catch {
    return parseZapMarkdown(source);
  }
}

function getConvexClient() {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}
