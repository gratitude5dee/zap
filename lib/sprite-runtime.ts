import { parseSpriteMarkdown, type SpriteSpec } from "@wzrdtech/core/sprite";

let cachedSource: string | undefined;
let cachedSpec: SpriteSpec | null = null;

export function activeSpriteSpec(env: Readonly<Record<string, string | undefined>> = process.env) {
  const source = env.SPRITE_MANIFEST_BASE64;
  if (!source) return null;
  if (env === process.env && source === cachedSource) return cachedSpec;
  const manifest = Buffer.from(source, "base64").toString("utf8");
  const spec = parseSpriteMarkdown(manifest);
  if (env === process.env) {
    cachedSource = source;
    cachedSpec = spec;
  }
  return spec;
}

export function assertSpriteZapAllowed(slug: string, env?: Readonly<Record<string, string | undefined>>) {
  const spec = activeSpriteSpec(env);
  if (spec && !spec.zaps.includes(slug)) throw new Error(`Zap ${slug} is not included in Sprite ${spec.sprite}.`);
}

export function isSpriteChannelEnabled(channel: SpriteSpec["channels"][number], env?: Readonly<Record<string, string | undefined>>) {
  const spec = activeSpriteSpec(env);
  return !spec || spec.channels.includes(channel);
}
