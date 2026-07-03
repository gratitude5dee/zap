---
zap: caught-by-the-cam
version: 1
description: Draft Zap for a live-broadcast fan cutaway where the uploaded person is caught by the stadium camera.
inputs:
  image:
    type: image
    required: true
    hint: clear selfie or fan photo
  FAN_COUNTRY:
    type: string
    required: true
    label: Fan country
  TEAM_1:
    type: string
    required: true
  TEAM_2:
    type: string
    required: true
  SCORE_1:
    type: string
    required: true
  SCORE_2:
    type: string
    required: true
  MATCH_PERIOD:
    type: string
    required: true
  MATCH_TIME:
    type: string
    required: true
  STAT_TITLE:
    type: string
    required: true
  STAT_1:
    type: string
    required: true
  STAT_2:
    type: string
    required: true
defaults:
  provider: fal
  aspect: "16:9"
budget:
  estimate_usd: 4.5
  cap_usd: 10
steps:
  - id: crowd_shot
    kind: image.edit
    tier: final
    model: fal-ai/flux/dev
    provider: fal
    inputs: [user.image]
    prompt: prompts/crowd-shot.md
  - id: initial_gen
    kind: video.gen
    tier: final
    model: fal-ai/kling-video/v2.1/pro/image-to-video
    provider: fal
    duration_s: 10
    reference_images: [crowd_shot]
    prompt: prompts/initial-gen.md
  - id: finalize
    kind: stitch
    inputs: [initial_gen]
    stitch:
      engine: auto
      format: mp4
      quality: standard
    audio:
      mix: keep
output: Zap.mp4
---

# Caught By The Cam

Draft sample recipe for a readable broadcast-style fan moment with scoreboard
and stats overlays. Keep face, outfit, and overlay text stable.
