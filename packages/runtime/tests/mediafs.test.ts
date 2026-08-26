// Content-addressed media FS: same bytes → same path, idempotent put, get by
// hash, filtered list, hardlink into /zap/fs, zod-validated sidecars.
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createMediaFs, extensionForMime, mediaSidecarSchema, type MediaSidecar } from "../src/mediafs/index.ts";

let root: string;
let fsRoot: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "zap-mediafs-"));
  fsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "zap-fs-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(fsRoot, { recursive: true, force: true });
});

function sidecar(partial: Partial<MediaSidecar> = {}): MediaSidecar {
  return {
    schema: 1,
    sha256: "",
    kind: "image",
    mime: "image/png",
    bytes: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("media FS", () => {
  it("puts bytes at /<kind>/<sha[0:2]>/<sha>.<ext> with a sidecar", async () => {
    const mediafs = createMediaFs({ root });
    const bytes = new TextEncoder().encode("hello media");
    const sha = createHash("sha256").update(bytes).digest("hex");
    const result = await mediafs.put("image", bytes, sidecar());
    expect(result.sha256).toBe(sha);
    expect(result.path).toBe(path.join(root, "image", sha.slice(0, 2), `${sha}.png`));
    const stored = JSON.parse(await fs.readFile(`${result.path}.json`, "utf8"));
    expect(mediaSidecarSchema.parse(stored).sha256).toBe(sha);
  });

  it("is idempotent: same bytes produce the same path and do not error", async () => {
    const mediafs = createMediaFs({ root });
    const bytes = new TextEncoder().encode("same bytes");
    const first = await mediafs.put("image", bytes, sidecar({ prompt: "first" }));
    const second = await mediafs.put("image", bytes, sidecar({ prompt: "second" }));
    expect(second.path).toBe(first.path);
    expect(second.sha256).toBe(first.sha256);
  });

  it("gets by hash and returns null for unknown hashes", async () => {
    const mediafs = createMediaFs({ root });
    const bytes = new TextEncoder().encode("fetch me");
    const { sha256 } = await mediafs.put("audio", bytes, sidecar({ kind: "audio", mime: "audio/mpeg" }));
    const got = await mediafs.get(sha256);
    expect(got).not.toBeNull();
    expect(Buffer.from(got!.bytes).toString("utf8")).toBe("fetch me");
    expect(got!.sidecar.kind).toBe("audio");
    expect(await mediafs.get("0".repeat(64))).toBeNull();
  });

  it("accepts a ReadableStream body", async () => {
    const mediafs = createMediaFs({ root });
    const bytes = new TextEncoder().encode("streamed");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const result = await mediafs.put("image", stream, sidecar());
    expect(result.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("lists with kind/provider/model/runId filters", async () => {
    const mediafs = createMediaFs({ root });
    await mediafs.put("image", new TextEncoder().encode("a"), sidecar({ provider: "fal", model: "fal-ai/flux/dev", runId: "run-1" }));
    await mediafs.put("video", new TextEncoder().encode("b"), sidecar({ kind: "video", mime: "video/mp4", provider: "gmi", runId: "run-2" }));

    const all: MediaSidecar[] = [];
    for await (const entry of mediafs.list()) all.push(entry);
    expect(all).toHaveLength(2);

    const filtered: MediaSidecar[] = [];
    for await (const entry of mediafs.list({ kind: "video", provider: "gmi", runId: "run-2" })) filtered.push(entry);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.kind).toBe("video");

    const none: MediaSidecar[] = [];
    for await (const entry of mediafs.list({ model: "unknown" })) none.push(entry);
    expect(none).toHaveLength(0);
  });

  it("hardlinks into project dirs", async () => {
    const mediafs = createMediaFs({ root });
    const bytes = new TextEncoder().encode("link me");
    const { sha256, path: mediaPath } = await mediafs.put("image", bytes, sidecar());
    const into = path.join(fsRoot, "project");
    await mediafs.link(sha256, into);
    const linked = path.join(into, path.basename(mediaPath));
    const [a, b] = await Promise.all([fs.stat(mediaPath), fs.stat(linked)]);
    expect(a.ino).toBe(b.ino);
    await expect(mediafs.link("0".repeat(64), into)).rejects.toThrow();
  });

  it("rejects sidecars that fail schema validation", async () => {
    const mediafs = createMediaFs({ root });
    await expect(
      mediafs.put("image", new TextEncoder().encode("x"), { ...sidecar(), mime: 42 as unknown as string }),
    ).rejects.toThrow();
  });

  it("maps mimes to stable extensions", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("video/quicktime")).toBe("mov");
    expect(extensionForMime("model/gltf-binary")).toBe("glb");
    expect(extensionForMime("application/x-unknown")).toBe("xunknown");
  });

  it("sidecar JSON schema snapshot", () => {
    expect(z.toJSONSchema(mediaSidecarSchema)).toMatchSnapshot();
  });
});
