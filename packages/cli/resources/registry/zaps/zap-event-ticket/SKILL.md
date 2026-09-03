---
description: Event poster plus a staged event_ticket listing in the creator's air storefront. Load when the user wants to sell tickets to a show, meetup, or stream from a Zap, or asks to run event-ticket.
---

# Event Ticket Zap

Executable recipe frontmatter lives in sibling `Zap.md`. Steps:

1. `image.gen` (`poster`) renders a 9:16 poster from the event details.
2. `commerce.stage_listing` (`stage_ticket`) writes an `event_ticket` entry to
   the box catalog and POSTs `{"action":"publish_catalog"}` to air, which files
   a `shop_publish` decision for the owner.

Rules:

- Plan by default. `zap run event-ticket --json` describes what would be staged
  and submits nothing. `--live` is required to generate the poster and stage.
- The commerce step never charges and never mints tickets. After approval,
  air's existing checkout mints `ticket_code` on `checkout.session.completed`
  and enforces exactly-once check-in.
- Prices are in cents (`PRICE_CENTS=2500` is $25.00). `CAPACITY` becomes the
  listing inventory; omit it for unlimited tickets.
- Live staging requires the air box gateway (`~/.hermes/.env`) or
  `ZAP_AIR_API_BASE` + `ZAP_AIR_GATEWAY_TOKEN`.

Use `run_zap` with slug `event-ticket`.
