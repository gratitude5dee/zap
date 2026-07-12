---
sprite: world-cup
version: 1
description: A World Cup media Sprite with a hosted Eve agent and chat delivery.
zaps:
  - world-cup-entrance
sandbox: box-standard
model:
  route: gateway
  id: anthropic/claude-sonnet-4.6
connections: []
connectors: []
social: []
channels:
  - slack
---

# World Cup Sprite

Runs the World Cup entrance Zap through a Vercel-hosted Eve agent and replies in Slack.
