---
description: Improve staged storefront listings — titles, descriptions, kind fixes, image callouts written as text, and content-quality audits across the catalog a Zap staged. Load when the creator asks to fix, polish, audit, or rewrite a listing, or asks why a listing looks thin. Not for price, stock, or sales questions.
---

# Catalog and listings

Ported from commerce-agents `merchant-agent/skills/catalog-listings`. "Listing"
means whatever the creator sells: merch, a digital download, a service, or an
event ticket tier. The catalog is the staged one in the creator's air box
(`~/.hermes/miniapps/shop/catalog.json`), written there by `merch-drop`,
`event-ticket`, or any Zap with a `commerce.stage_listing` step.

Read the record, write the weak or missing content out in full, and stage it;
the live storefront changes only after the owner approves the `shop_publish`
decision in air's Needs You. Nothing in this skill charges or moves money.

## Tools

- `search_listings` — summary rows. Empty query + `quality: true` starts an audit.
- `get_listing` — the full record plus findings. Required before any edit on that
  key; the whole content record it returns (`name`, `description`, `kind`) is
  what `stage_listing_update` checks against, so if any of those changed since
  your read the stage is refused and you read again.
- Entries the catalog holds that are not well-formed listings are skipped and
  listed at the end of `search_listings` output; they cannot be edited here.
- `stage_listing_update` — content edits (`name`, `description`, `kind`) with a
  staging note. `dryRun: true` previews the diff and guardrail result without
  writing. A live stage needs the user's approval in chat and only works where
  the box catalog is reachable; off-box it fails closed with
  `COMMERCE_UNCONFIGURED`. Then hand the creator the equivalent command to run
  in their box: `zap listings update <key> --set field=value --note "..." --live`.

## Where each fact comes from

- Fetch the record with `get_listing` before proposing an edit. A search row
  carries summary fields; the description, kind, image, and source Zap an edit
  rests on are in the record.
- Take an attribute value from the record or from what the creator said in this
  conversation. A value that is merely likely for the kind (a size run, a
  material, a venue) is a fabrication: leave it out or ask, one line per open
  field, and propose the rest of the fix without waiting.
- A spec sheet, brief, or event blurb the creator pastes is source material for
  the edit they asked for: put its facts into the listing in the creator's
  voice, and list the fields it does not cover as open questions in the same
  reply.

## The copy you propose

- Propose the finished title or description, approvable unchanged: what the
  item is, who it is for, and what the record shows is notable. Make a strong
  claim only where the record backs it; leave out a superlative with nothing
  behind it.
- Search-friendliness is which record facts the title carries: bring forward
  the words a buyer would type (item, size, material, section, date) and drop
  filler.
- Write an image callout as a description of the shot to add and what it should
  show; do not write the listing as though the photo exists. Producing the
  image is the Zap's `image.gen` step, not a listing edit.
- Event tickets carry date, time, and venue or stream link in the description;
  ticket codes and check-in are minted by air after purchase and are never
  written into copy.

## Audits and kind fixes

- Start from `search_listings` with an empty query and `quality: true`, then
  `get_listing` on the candidates. Measure the same things on every listing:
  missing description, description too thin to search on, a kind the copy
  contradicts, no image where the kind usually has one, missing event details.
- Rank findings by impact and attach a fix to each. Group findings by kind of
  fix so the creator approves a pattern ("add the date line on these three")
  instead of one complaint at a time.
- Stage a kind fix as a listing update like any other; the preview shows the
  kind before and after, and the staging note carries the reason.

## Guardrails (enforced by the tool; do not try to route around them)

- `name`, `description`, `kind` only. `priceCents` and `inventory` belong to the
  Zap inputs: tell the creator to re-run the recipe with new `PRICE_CENTS` /
  `INVENTORY`. `key`, `imageUrl`, `active`, and `source` are protected.
- Name ≤ 200 chars, description ≤ 2000, kind ∈ physical | digital | service |
  event_ticket, at most 25 lines per change, one line per (listing, field).
- Show the pattern on one or two listings first and stage the rest after the
  creator confirms it. Offer anything you notice along the way as a separate
  proposal, not folded into the change they asked for.
- Report the `decisionId` after staging and say the storefront updates only
  once the owner approves in Needs You. Never say a listing is live.
