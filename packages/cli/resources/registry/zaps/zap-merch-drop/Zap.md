---
zap: merch-drop
version: 2
description: Turn a selfie or product photo into product art and stage a physical merch listing in the creator's air storefront for owner approval. Use when the user wants to sell a shirt, print, or other physical item from a Zap.
inputs:
  image:
    type: image
    required: true
    hint: selfie or clean product photo
  PRODUCT_NAME:
    type: string
    required: true
    label: Product name
  PRICE_CENTS:
    type: number
    required: true
    label: Price in cents (3500 = $35.00)
  INVENTORY:
    type: number
    required: false
    label: Units available (leave empty for unlimited)
  STYLE:
    type: string
    required: false
    label: Art direction (optional)
    hint: e.g. bold streetwear graphic, screen-print look
defaults:
  provider: fal
  aspect: "1:1"
budget:
  estimate_usd: 0.05
  cap_usd: 1
steps:
  - id: product_art
    kind: image.gen
    prompt: prompts/product-art.md
    inputs: [user.image]
    candidates: 1
    tier: final
  - id: stage_listing
    kind: commerce.stage_listing
    inputs: [product_art]
    listing:
      kind: physical
      name: "{PRODUCT_NAME}"
      description: "Limited merch drop: {PRODUCT_NAME}. Art generated from the creator's own photo."
      priceCents: user.PRICE_CENTS
      inventory: user.INVENTORY
      image: product_art
output: staged listing summary (JSON) for the shop_publish decision
---

# Merch Drop

`image.gen` renders product art from the uploaded photo, then
`commerce.stage_listing` writes a `physical` catalog entry to the box's
`~/.hermes/miniapps/shop/catalog.json` and asks air to file a `shop_publish`
decision. Nothing is charged: the listing becomes buyable only after the owner
approves it, and checkout stays on air's Stripe Connect flow with server-side
pricing.

```bash
zap run merch-drop --input image=./selfie.png --input PRODUCT_NAME="Tour Tee" --input PRICE_CENTS=3500 --json
zap run merch-drop --input image=./selfie.png --input PRODUCT_NAME="Tour Tee" --input PRICE_CENTS=3500 --live
```
