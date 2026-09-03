---
zap: event-ticket
version: 2
description: Generate an event poster and stage an event_ticket listing in the creator's air storefront for owner approval. Use when the user wants to sell tickets to a show, meetup, or stream from a Zap.
inputs:
  EVENT_NAME:
    type: string
    required: true
    label: Event name
  EVENT_DATE:
    type: string
    required: true
    label: Date and time
  VENUE:
    type: string
    required: true
    label: Venue or "online"
  POSTER_PROMPT:
    type: textarea
    required: true
    label: Poster art direction
    hint: mood, palette, key visual
  PRICE_CENTS:
    type: number
    required: true
    label: Ticket price in cents (2500 = $25.00)
  CAPACITY:
    type: number
    required: false
    label: Tickets available (leave empty for unlimited)
defaults:
  provider: fal
  aspect: "9:16"
budget:
  estimate_usd: 0.05
  cap_usd: 1
steps:
  - id: poster
    kind: image.gen
    prompt: prompts/poster.md
    candidates: 1
    tier: final
  - id: stage_ticket
    kind: commerce.stage_listing
    inputs: [poster]
    listing:
      kind: event_ticket
      name: "{EVENT_NAME} — {EVENT_DATE}"
      description: "{EVENT_NAME} at {VENUE} on {EVENT_DATE}. Your ticket code is issued after checkout and scanned once at the door."
      priceCents: user.PRICE_CENTS
      inventory: user.CAPACITY
      image: poster
output: staged listing summary (JSON) for the shop_publish decision
---

# Event Ticket

`image.gen` renders a portrait poster from the event details, then
`commerce.stage_listing` writes an `event_ticket` catalog entry and asks air to
file a `shop_publish` decision. Once the owner approves, buyers check out
through air's Stripe Connect flow; `checkout.session.completed` mints the
`ticket_code` and check-in is exactly-once. The Zap itself never charges.

```bash
zap run event-ticket --input EVENT_NAME="Rooftop Set" --input EVENT_DATE="Sat Oct 4, 9pm" \
  --input VENUE="The Annex" --input POSTER_PROMPT="neon skyline, warm dusk" --input PRICE_CENTS=2500 --json
```
