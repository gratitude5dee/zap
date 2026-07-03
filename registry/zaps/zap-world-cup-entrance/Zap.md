---
zap: world-cup-entrance
version: 1
description: World Cup player-entrance highlight reel from a selfie. Use when the user wants a cinematic stadium intro video of themselves.
inputs:
  image:
    type: image
    required: true
    hint: clear front-facing selfie
  NAME:
    type: string
    required: true
    label: Player name
  COUNTRY:
    type: string
    required: true
    label: Country
  NO:
    type: string
    required: true
    label: Jersey number
defaults:
  provider: gmi
  aspect: "16:9"
budget:
  estimate_usd: 7.5
  cap_usd: 15
steps:
  - id: sketch
    kind: image.edit
    tier: draft
    model: fal-ai/flux/dev
    provider: fal
    inputs: [user.image]
    prompt: prompts/initial-frame-a.md
  - id: character_sheet
    kind: image.edit
    tier: final
    model: fal-ai/flux/dev
    provider: fal
    inputs: [sketch]
    prompt: prompts/initial-frame-b.md
  - id: initial_gen
    kind: video.gen
    tier: final
    candidates: 1
    model: seedance-2-0-260128
    provider: gmi
    duration_s: 15
    reference_images: [character_sheet]
    prompt: prompts/initial-gen.md
    judge:
      enabled: true
      criteria: [identity_consistency, pacing, prompt_adherence]
    rlhf: optional
  - id: extend
    kind: video.extend
    tier: final
    model: seedance-2-0-260128
    provider: gmi
    duration_s: 15
    repeat:
      min: 0
      max: 64
      default: 0
    extend:
      mode: chain
    first_frame:
      from: prev.last_frame
      upscale: 4k
    keyframes:
      mode: optional
    prompt: prompts/extend-gen.md
  - id: finalize
    kind: stitch
    inputs: [initial_gen, extend.*]
    stitch:
      engine: auto
      format: mp4
      quality: standard
    audio:
      mix: keep
output: Zap.mp4
---

# World Cup Entrance

Premium sports-broadcast aesthetic: night stadium, floodlights, tunnel fog,
low-angle hero tracking, broadcast graphics, and confident player-introduction
energy. Face consistency is the acceptance bar; if the judge scores identity
below 0.7, regenerate the character sheet before animating.
