# Zap Schema

`Zap.md` starts with YAML frontmatter. The minimum shape is:

```yaml
---
zap: launch-trailer
version: 2
description: A short creator video.
budget:
  estimate_usd: 0
  cap_usd: 5
defaults:
  provider: fal
  models:
    image.gen: fal-ai/flux/dev
    video.gen: fal-ai/kling-video/v2.1/pro/image-to-video
inputs:
  PROMPT:
    type: textarea
    required: true
steps:
  - id: initial_frame
    kind: image.gen
    provider: fal
    model: fal-ai/flux/dev
    prompt: prompts/initial-frame.md
  - id: initial_gen
    kind: video.gen
    provider: fal
    model: fal-ai/kling-video/v2.1/pro/image-to-video
    inputs: [initial_frame]
    duration_s: 15
    retry:
      max: 2
      backoff_s: 3
      fallback_provider: fal
    prompt: prompts/initial-gen.md
  - id: stitch
    kind: stitch
    inputs: [initial_gen]
output: Zap.mp4
---
```

## Step Kinds

`image.gen`, `image.edit`, `video.gen`, `video.extend`, `video.edit`, `video.upscale`, `audio.tts`, `audio.music`, `audio.sfx`, `keyframes`, and `stitch`.

## Retry Policy

Provider-backed steps may include bounded retry settings:

```yaml
retry:
  max: 2
  backoff_s: 3
  fallback_provider: fal
  fallback_model: fal-ai/kling-video/v2.1/pro/image-to-video
```

The runner retries failed provider work up to `max` times, waits `backoff_s`
between attempts, and switches to fallback provider/model on retry attempts
when those fields are present.

## HyperFrames Stitching

Use HyperFrames only when the recipe needs HTML composition:

```yaml
stitch:
  engine: hyperframes
  quality: standard
  format: mp4
```

HyperFrames recipes must include a `DESIGN.md` visual identity before composition HTML is generated.
At runtime, Zap also writes a minimal temporary `DESIGN.md` for generated stitch wrappers so provider assets render through a compliant HyperFrames project. If the HyperFrames CLI is not installed, the runner falls back to the local stitch path and returns the first resolved asset with an explanatory step error.
