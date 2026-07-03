# Zap Schema

`Zap.md` starts with YAML frontmatter. The minimum shape is:

```yaml
---
zap: launch-trailer
version: 1
description: A short creator video.
budget:
  estimate_usd: 0
  cap_usd: 5
defaults:
  provider: mock
inputs:
  PROMPT:
    type: textarea
    required: true
steps:
  - id: initial_frame
    kind: image.gen
    provider: mock
    model: mock-image
    prompt: prompts/initial-frame.md
  - id: initial_gen
    kind: video.gen
    provider: mock
    model: mock-video
    inputs: [initial_frame]
    duration_s: 15
    prompt: prompts/initial-gen.md
  - id: stitch
    kind: stitch
    inputs: [initial_gen]
output: Zap.mp4
---
```

## Step Kinds

`image.gen`, `image.edit`, `video.gen`, `video.extend`, `video.edit`, `video.upscale`, `audio.tts`, `audio.music`, `audio.sfx`, `keyframes`, and `stitch`.

## HyperFrames Stitching

Use HyperFrames only when the recipe needs HTML composition:

```yaml
stitch:
  engine: hyperframes
  quality: standard
  format: mp4
```

HyperFrames recipes must include a `DESIGN.md` visual identity before composition HTML is generated.
