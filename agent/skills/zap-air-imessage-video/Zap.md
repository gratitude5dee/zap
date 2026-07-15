---
zap: air-imessage-video
version: 2
description: Private five-second Seedance Fast video generation for the Air iMessage service.
publish:
  slug: air-imessage-video
  visibility: private
inputs:
  PROMPT:
    type: textarea
    label: Prompt
    required: true
  IMAGE:
    type: image
    label: Optional first frame
    required: false
defaults:
  provider: gmi
  models:
    video.gen: seedance-2-0-fast-260128
  aspect: adaptive
budget:
  # The actual estimate is derived from the operator-verified GMI rate at
  # runtime; do not encode a potentially stale provider price here.
  estimate_usd: 0
  cap_usd: 5
steps:
  - id: seedance
    kind: video.gen
    tier: final
    model: seedance-2-0-fast-260128
    provider: gmi
    duration_s: 5
    inputs: [user.IMAGE]
    prompt: prompts/generate.md
output: Air.mp4
---

# Air iMessage Video

The Air adapter accepts a text prompt and an optional first-frame image, then
generates one short Seedance Fast video for delivery back over iMessage.
