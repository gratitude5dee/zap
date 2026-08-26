# zap-med-genmedia

Alias of `zap-med` (no named snapshot of its own) that pins generative-media
defaults and the stitch presets. Created through
`POST /boxes {from: "zap-med", setupScript}`.

## Compose

```ts
createRuntime({
  weight: "med",
  plugins: [box({ template: "zap-med-genmedia", size: "default" })],
})
```

## Defaults

- `image.gen` → `fal` / `fal-ai/flux/dev`
- `video.gen` → `gmi` / `seedance-2-0-260128`
- `audio.gen` → `replicate` / `minimax/speech-02-turbo`
- Presets enabled: `stitch`, `overlay`, `gen-media-post`

Verification: `packages/templates/zap-med-genmedia/doctor.sh`.
