---
description: Product art from a selfie or product photo, staged as a physical merch listing in the creator's air storefront. Load when the user wants to sell a shirt, print, or other physical item from a Zap, or asks to run merch-drop.
---

# Merch Drop Zap

Executable recipe frontmatter lives in sibling `Zap.md`. Steps:

1. `image.gen` (`product_art`) renders square product art from the uploaded photo.
2. `commerce.stage_listing` (`stage_listing`) writes a `physical` entry to the
   box catalog (`~/.hermes/miniapps/shop/catalog.json`) and POSTs
   `{"action":"publish_catalog"}` to air, which files a `shop_publish`
   decision for the owner.

Rules:

- Plan by default. `zap run merch-drop --json` describes what would be staged
  and submits nothing. `--live` is required to generate art and stage.
- The commerce step never charges. Approval happens in air ("Needs you"); the
  buyer pays through air's Stripe Connect checkout with server-derived prices.
- Prices are in cents (`PRICE_CENTS=3500` is $35.00). Omit `INVENTORY` for an
  unlimited run.
- Live staging requires the air box gateway (`~/.hermes/.env`) or
  `ZAP_AIR_API_BASE` + `ZAP_AIR_GATEWAY_TOKEN`.

Use `run_zap` with slug `merch-drop`.
