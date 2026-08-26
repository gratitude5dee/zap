import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import { mediaSidecarSchema, type MediaKind, type MediaSidecar } from "./schema.ts";

export { mediaKindSchema, mediaSidecarSchema, type MediaKind, type MediaSidecar } from "./schema.ts";

export interface MediaFs {
  /** content-addressed: /zap/media/<kind>/<sha256[0:2]>/<sha256>.<ext> + .json sidecar */
  put(
    kind: MediaKind,
    bytes: Uint8Array | ReadableStream<Uint8Array>,
    sidecar: MediaSidecar,
  ): Promise<{ sha256: string; path: string }>;
  get(sha256: string): Promise<{ bytes: Uint8Array; sidecar: MediaSidecar } | null>;
  list(
    filter?: Partial<Pick<MediaSidecar, "kind" | "provider" | "model" | "runId">>,
  ): AsyncIterable<MediaSidecar>;
  /** hardlink into /zap/fs project dirs */
  link(sha256: string, into: string): Promise<void>;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "model/gltf-binary": "glb",
};

export function extensionForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "") ?? "bin";
}

async function collect(bytes: Uint8Array | ReadableStream<Uint8Array>): Promise<Uint8Array> {
  if (bytes instanceof Uint8Array) return bytes;
  const chunks: Uint8Array[] = [];
  const reader = bytes.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function createMediaFs(options: { root?: string } = {}): MediaFs {
  const root = options.root ?? "/zap/media";

  function mediaPathFor(sidecar: Pick<MediaSidecar, "kind" | "sha256" | "mime">): string {
    return path.join(root, sidecar.kind, sidecar.sha256.slice(0, 2), `${sidecar.sha256}.${extensionForMime(sidecar.mime)}`);
  }

  async function readSidecars(): Promise<MediaSidecar[]> {
    const sidecars: MediaSidecar[] = [];
    let kinds: string[] = [];
    try {
      kinds = await fs.readdir(root);
    } catch {
      return sidecars;
    }
    for (const kind of kinds) {
      let prefixes: string[] = [];
      try {
        prefixes = await fs.readdir(path.join(root, kind));
      } catch {
        continue;
      }
      for (const prefix of prefixes) {
        const dir = path.join(root, kind, prefix);
        for (const entry of await fs.readdir(dir)) {
          if (!entry.endsWith(".json")) continue;
          const parsed = mediaSidecarSchema.safeParse(JSON.parse(await fs.readFile(path.join(dir, entry), "utf8")));
          if (parsed.success) sidecars.push(parsed.data);
        }
      }
    }
    return sidecars;
  }

  return {
    async put(kind, bytes, sidecar) {
      const buffer = await collect(bytes);
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const complete = mediaSidecarSchema.parse({
        ...sidecar,
        bytes: buffer.byteLength,
        kind,
        sha256,
      });
      const mediaPath = mediaPathFor(complete);
      await fs.mkdir(path.dirname(mediaPath), { recursive: true });
      try {
        await fs.writeFile(mediaPath, buffer, { flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      await fs.writeFile(`${mediaPath}.json`, `${JSON.stringify(complete, null, 2)}\n`);
      return { sha256, path: mediaPath };
    },
    async get(sha256) {
      for (const sidecar of await readSidecars()) {
        if (sidecar.sha256 !== sha256) continue;
        const bytes = await fs.readFile(mediaPathFor(sidecar));
        return { bytes, sidecar };
      }
      return null;
    },
    async *list(filter) {
      for (const sidecar of await readSidecars()) {
        if (filter?.kind !== undefined && sidecar.kind !== filter.kind) continue;
        if (filter?.provider !== undefined && sidecar.provider !== filter.provider) continue;
        if (filter?.model !== undefined && sidecar.model !== filter.model) continue;
        if (filter?.runId !== undefined && sidecar.runId !== filter.runId) continue;
        yield sidecar;
      }
    },
    async link(sha256, into) {
      for (const sidecar of await readSidecars()) {
        if (sidecar.sha256 !== sha256) continue;
        const mediaPath = mediaPathFor(sidecar);
        await fs.mkdir(into, { recursive: true });
        await fs.link(mediaPath, path.join(into, path.basename(mediaPath)));
        return;
      }
      throw new Error(`No media object with sha256 ${sha256}.`);
    },
  };
}

export interface MediaFsPluginConfig {
  root?: string;
}

const schema = z.object({ root: z.string().optional() }).optional();

/** In-VM media FS plugin: provides the "mediafs" service rooted at /zap/media. */
export const mediaFsCore = definePlugin<MediaFsPluginConfig | undefined>({
  name: "mediafs.core",
  schema,
  apply(ctx, config) {
    ctx.provide("mediafs", createMediaFs({ root: config?.root }));
  },
});
