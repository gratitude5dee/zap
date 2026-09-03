# Commerce

Commerce steps let a Zap end in a buyable storefront listing instead of a video. They are
**staging-only**: a Zap never charges a card, never moves money, and never writes to the
storefront directly. Charging stays inside air's decision-gated Stripe Connect flow with
server-derived prices.

## The creator flow

```text
zap run merch-drop --live
  1. image.gen             -> product art (provider spend, quoted up front)
  2. commerce.stage_listing -> writes ~/.hermes/miniapps/shop/catalog.json
                              POST /api/miniapps/commerce {"action":"publish_catalog"}
                              => pending `shop_publish` decision
air "Needs you"
  3. owner approves shop_publish -> applyCatalogPublish projects to storefront_products
storefront
  4. buyer opens the creator's shop mini-app -> Stripe Connect checkout, price read
     from storefront_products (never from the client)
  5. checkout.session.completed -> fulfilment; event_ticket listings mint a ticket_code
     that scans exactly once at the door
```

Steps 1–2 are the Zap. Steps 3–5 are air's existing MA8 commerce rails; the Zap adds
nothing to them. Until step 3 happens the listing is invisible to buyers and nothing can
be charged.

## Plan-only by default

Without `--live` a commerce step quotes `$0`, submits nothing, and reports what it *would*
stage:

```bash
npx @wzrdtech/zap run merch-drop --json
```

Both recipes ship with the CLI, so this works from any directory. `zap run <slug>` looks
in the current project's `agent/skills/` first and falls back to the bundled registry;
`zap add zap-merch-drop` copies the recipe into your project when you want to edit it.

```json
{
  "kind": "commerce.stage_listing",
  "provider": "air",
  "quoteUsd": 0,
  "status": "planned",
  "wouldStage": {
    "action": "stage_listing",
    "charges": false,
    "imageFrom": "product_art",
    "kind": "physical",
    "requiresOwnerApproval": true
  }
}
```

Plan-only runs need no credentials — no provider keys and no air gateway.

## Live runs

`--live` runs must execute **inside the creator's air box**, where the Hermes runtime has
already written `~/.hermes/.env` with the box gateway (`OPENAI_BASE_URL` ending in
`/api/gateway/v1` and `OPENAI_API_KEY` as the gateway token). The commerce step derives
the air API base and token from those values; a plain OpenAI key is never reused. Outside
a box, set `ZAP_AIR_API_BASE`, `ZAP_AIR_GATEWAY_TOKEN`, and optionally
`ZAP_AIR_CATALOG_PATH` explicitly. With none of these configured the step fails closed
with `COMMERCE_UNCONFIGURED` before touching the catalog.

The gateway token only ever travels to the host that issued it: setting `ZAP_AIR_API_BASE`
to anything other than the gateway host requires an explicit `ZAP_AIR_GATEWAY_TOKEN`, and
the API base must be `https://` (plain `http://` is accepted only for `localhost` /
`127.0.0.1` / `::1`; anything else fails with `COMMERCE_INSECURE_API_BASE`).

The hosted runner (`zap.wzrd.tech`) refuses a live run that contains any commerce step at
submission time — before credentials are resolved or any media step is sent to a
provider — because staging belongs to the box that owns the catalog. Dry runs still plan.

Each live run:

1. Publishes the generated image through `POST /api/media/publish` when possible so the
   listing gets an R2 public URL (air drops any other image host to `null`). Only image
   files (`.png .jpg .jpeg .webp .gif`) under the run's assets directory, the project
   directory, or `~/.hermes/inbox` are eligible; anything else stages without an image.
2. Upserts one catalog entry by `key` — re-running the same Zap updates the listing rather
   than duplicating it. The read-modify-write holds `catalog.json.lock` so concurrent runs
   cannot drop each other's listings, and a catalog that exists but cannot be read or parsed
   aborts the run (`COMMERCE_CATALOG_UNREADABLE`) instead of being overwritten.
3. Files `publish_catalog`. air deduplicates an already-pending `shop_publish` decision, so
   repeated runs reuse it (`decisionReused: true`). Because of that, a request whose reply
   is lost is retried once; if it times out again the run fails with
   `COMMERCE_STAGE_TIMEOUT` and says air may already hold the decision — running again
   converges on it and nothing is charged. `commerce.payment_request` is never retried, since
   a repeat would file a second request: any lost reply — a timeout, a dropped connection, or a
   `200` whose body never arrives — is reported as possibly filed and is not marked
   retryable; check Needs You first.

## Writing a listing

```yaml
steps:
  - id: product_art
    kind: image.gen
    prompt: prompts/product-art.md
    inputs: [user.image]
  - id: stage_listing
    kind: commerce.stage_listing
    inputs: [product_art]
    listing:
      kind: physical            # physical | digital | service | event_ticket
      name: "{PRODUCT_NAME}"
      description: "Limited drop: {PRODUCT_NAME}"
      priceCents: user.PRICE_CENTS   # integer cents, 1 .. 10_000_000, or a literal
      inventory: user.INVENTORY      # integer >= 0, null for unlimited, optional
      image: product_art             # an earlier image step or user.<image input>
```

Constraints mirror air's `sanitizeCatalogItem`: `key` is derived from the name unless set
(`^[a-z0-9][a-z0-9_-]{0,63}$`), names are ≤200 chars, descriptions ≤2000. `image` must
reference an image step that appears earlier in the file, or a declared `type: image`
input; validation rejects a reference to a later step.

## Bundled recipes

- `merch-drop` — selfie/product photo + name + price → `physical` listing.
- `event-ticket` — event details + poster prompt + price → `event_ticket` listing;
  fulfilment mints and scans ticket codes through air's existing checkout webhook.

## Invariants

- No Zap step charges or moves money; `charges: false` is emitted on every commerce result.
- Catalog publishing is owner-approved (`shop_publish`) before anything reaches buyers.
- Prices are server-derived from `storefront_products` at checkout, never client-supplied.
- `commerce.payment_request` likewise only files a `payment_request` decision.

See [Commerce Agents](./commerce-agents.md) for the exact catalog entry air
accepts, the field aliases, and what happens after the owner approves.
[Commerce rollout](./commerce-rollout.md) is the order of operations for taking
the recipes from plan-only to one creator's live storefront and beyond.
