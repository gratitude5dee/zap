# Media filesystem

The Zap media FS is a content-addressed store for generated media on med+
runtimes, rooted at `/zap/media`.

## Layout

```
/zap/media/<kind>/<sha256[0:2]>/<sha256>.<ext>
/zap/media/<kind>/<sha256[0:2]>/<sha256>.json   # sidecar
```

`kind` is `image | audio | video | 3d`; the extension is derived from the
sidecar MIME type. Same bytes → same path: `put` hashes the content
(SHA-256), writes once, and is idempotent on re-puts of identical bytes.

## Sidecars

Every object has a JSON sidecar validated by `mediaSidecarSchema`
(`@wzrdtech/zap-runtime/mediafs`): schema version, `sha256`, `kind`, `mime`,
`bytes`, `createdAt`, and optional provenance — `runId`, `stepId`,
`provider`, `model`, `prompt`, `parents` (input hashes), `ffmpegPreset`,
`usd`, dimensions, and duration. Sidecars never contain secrets.

## API

```ts
const { sha256, path } = await mediafs.put("image", bytes, sidecar);
const object = await mediafs.get(sha256);         // bytes + sidecar, or null
for await (const s of mediafs.list({ kind: "video", runId })) { … }
await mediafs.link(sha256, "/zap/fs/project-a");  // hardlink into a project
```

- `list` filters on `kind`, `provider`, `model`, and `runId`.
- `link` hardlinks (same inode) into project directories under `/zap/fs`, so
  projects reference media without copying bytes.
- FFmpeg preset outputs are recorded here with `ffmpegPreset` set; gateway
  media results are recorded with `provider`/`model`/`usd`.

The store is provided by the `mediafs.core` plugin and available at boot on
`zap-med` and heavier templates.
