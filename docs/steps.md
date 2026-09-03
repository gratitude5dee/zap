# Steps

Zap pipelines follow the creative grammar:

```text
InitialFrame -> InitialGen -> InitialGenReViz? -> ExtendGen x N -> Zap.mp4
```

Supported step kinds:

- `image.gen`: create a first frame, storyboard, character sheet, or reference image.
- `image.edit`: transform an input image while preserving subject identity.
- `video.gen`: animate image or prompt inputs into a clip.
- `video.extend`: continue a clip from its last frame.
- `video.edit`: revise a clip with a prompt or composition layer.
- `video.upscale`: produce a higher-resolution clip.
- `audio.tts`: generate voiceover.
- `audio.music`: generate music.
- `audio.sfx`: generate sound effects.
- `keyframes`: extract, score, or prepare frames for the next step.
- `stitch`: combine assets into the final Zap artifact.
- `commerce.stage_listing`: stage a storefront listing built from an earlier image step. Staging-only: it quotes $0, writes the creator's air box catalog, and files a `shop_publish` decision for owner approval. It never charges a card. See [Commerce](./commerce.md).
- `commerce.payment_request`: stage a `payment_request` decision for owner approval. Staging-only, never charges.

Use `inputs` to name upstream step dependencies:

```yaml
steps:
  - id: initial_gen
    kind: video.gen
    inputs: [initial_frame]
```

Use HyperFrames only when composition is needed:

```yaml
stitch:
  engine: hyperframes
  format: mp4
  quality: standard
```

When HyperFrames is unavailable, Zap falls back to the local stitch path and records the fallback on the run step.
