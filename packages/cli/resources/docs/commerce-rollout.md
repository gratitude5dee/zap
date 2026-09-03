# Commerce rollout guide

How to take the commerce Zaps from a plan on your laptop to a buyable listing
in one creator's storefront, and how to widen from there. Read
[Commerce](./commerce.md) for the design; this page is the order of operations.

The invariant that makes every stage below safe to run: **a Zap never charges,
never moves money, and never edits the storefront.** It stages a catalog
change in the creator's box and files a `shop_publish` decision. Money moves
only when a buyer completes air's Stripe Connect checkout, and the storefront
changes only when the owner approves the decision in Needs you.

## Stage 0 — Plan-only dry runs (anywhere, no credentials)

`merch-drop` and `event-ticket` ship inside the `@wzrdtech/zap` package, so
this works from an empty directory:

```bash
npx @wzrdtech/zap run merch-drop --json
npx @wzrdtech/zap run event-ticket --json
```

Check three things in the plan output:

- `status` is `planned` and `live` is `false`: nothing was written anywhere.
- The `commerce.stage_listing` step has `quoteUsd: 0`. The only quoted spend is
  the `image.gen` step.
- `wouldStage` describes the listing (`name`, `kind`, `priceCents`,
  `inventory`, the image step it uses) and carries `charges: false` and
  `requiresOwnerApproval: true`.

Also plan from a hosted runner or the web studio: a live commerce Zap is
rejected there with `LOCAL_STEP_FAILED` before any provider work, because the
catalog lives in the creator's box. Plan-only works everywhere.

Repeat Stage 0 with real inputs (`--input PRODUCT_NAME=... --input PRICE_CENTS=...`)
until the `wouldStage` block reads exactly like the listing the creator wants.
There is no cost to iterating here.

## Stage 1 — One creator, merch-drop, live, in their box

Pick one creator whose air box is running and who has completed Stripe Connect
onboarding (their merchant row shows `charges_enabled`). Everything in this
stage happens inside that box, where `OPENAI_BASE_URL` and `OPENAI_API_KEY` are
the air gateway environment the CLI resolves automatically.

```bash
zap run merch-drop --live \
  --input image=~/.hermes/inbox/selfie.png \
  --input PRODUCT_NAME="Neon Wolf Tee" \
  --input PRICE_CENTS=3500 \
  --input INVENTORY=50
```

A successful run ends with
`1 commerce item(s) staged for owner approval; nothing was charged.` and the
`stage_listing` step carries `status: staged`, a `decisionId`, and
`charges: false`.

Then, in order:

1. **Inspect the catalog.** `cat ~/.hermes/miniapps/shop/catalog.json` shows
   the new item with an `imageUrl` on the media host. Re-running the Zap with
   the same `PRODUCT_NAME` replaces the entry by key rather than duplicating
   it.
2. **Approve in Needs you.** The `shop_publish` decision appears in the owner's
   Needs you queue (and, on iMessage, as a card that flips to Approved in
   place). Until this tap, buyers see nothing and nothing can be charged.
3. **Verify the storefront.** Open the creator's shop mini-app. The listing is
   present, the price matches `PRICE_CENTS`, the image renders. The price the
   buyer sees comes from `storefront_products`, projected at approval; the
   Zap's number was only a proposal.
4. **Make one real purchase** with a Stripe test card if the account is in test
   mode, or the smallest real price otherwise. Confirm the order flips to
   `paid` once and inventory decrements by one. That confirms the rails end to
   end without the Zap having touched any of them.

If anything fails, the failure mode is in the box or in air, not in the
storefront: a rejected listing or image (`COMMERCE_INVALID_LISTING`), a
missing gateway (`COMMERCE_UNCONFIGURED`), or an unreadable catalog
(`COMMERCE_CATALOG_UNREADABLE`) all stop before `publish_catalog` is sent. A
lost reply (`COMMERCE_STAGE_TIMEOUT`, or a `COMMERCE_STAGE_FAILED` that says
"may have filed the decision") is the one exception: the catalog edit is rolled
back, but air may already hold the pending `shop_publish` decision, so check
**Needs you** before retrying. The storefront is unchanged in every failure
case.

## Stage 2 — Content edits through the agent

Once the first listing is live, let the same creator improve its copy through
the `catalog-listings` skill rather than by re-running the Zap:

```bash
zap listings audit                              # what is thin or missing
zap listings get neon-wolf-tee                  # full record
zap listings update neon-wolf-tee \
  --set description="Heavyweight unisex tee, screen-printed Neon Wolf art." \
  --note "audit: missing description"           # plan; prints the diff
zap listings update ... --live                  # stages + refreshes the decision
```

The same rules apply as in Stage 1: the storefront changes only after the
owner approves the refreshed `shop_publish` decision, and price and inventory
are not editable this way (re-run the Zap with new inputs). Watch for the
owner being asked to approve too often; if the agent stages one field at a
time, tell it to batch the edits into one change (up to 25 lines).

## Stage 3 — event-ticket

Open `event-ticket` only after Stage 1 has produced a real paid order for a
`physical` listing, because tickets add fulfilment behaviour on the air side
(ticket codes and check-in) that a merch listing does not exercise.

```bash
zap run event-ticket --live \
  --input EVENT_NAME="Warehouse show" \
  --input EVENT_DATE="12 Oct, doors 8pm" \
  --input VENUE="140 Front St" \
  --input POSTER_PROMPT="..." \
  --input PRICE_CENTS=2500 \
  --input CAPACITY=100
```

Verify the same four points as Stage 1, plus:

- The catalog entry has `kind: event_ticket` and `inventory` equal to
  `CAPACITY` (or `null` for unlimited).
- The listing name and description carry the date, time, and venue. `zap
  listings audit` flags a ticket without them.
- A test purchase yields a `ticket_code` on the order, and scanning it a second
  time is refused. Both are air's existing `checkout.session.completed`
  fulfilment; the Zap added no code to that path.

## Stage 4 — Widen

After one creator has a paid merch order and one scanned ticket:

- Add creators one box at a time. Every box runs the same bundled recipes; the
  only per-creator prerequisite is Stripe Connect onboarding.
- Keep `budget.cap_usd` in both recipes small. Art is the only spend, and a cap
  in the low single digits covers it.
- Encourage creators to `zap add zap-merch-drop` and edit the prompt files
  rather than editing `Zap.md` step kinds; `zap validate` and `zap lint` keep
  the commerce step well-formed.

## What not to do

- Do not add a payment step to a Zap, and do not accept a recipe that claims
  to. `commerce.payment_request` stages a request; it does not collect.
- Do not point `ZAP_AIR_API_BASE` at a remote HTTP host to run commerce from
  outside a box. The CLI refuses plain HTTP off localhost, and off-box staging
  is not a supported path.
- Do not tell a creator a listing is live when the run says `staged`. It is
  live when the owner has approved and the storefront shows it.
- Do not wire a second commerce rail (for example Whop) into `stage_listing`.
  The step is rail-agnostic; if another rail is ever wanted, it is chosen at
  `shop_publish` apply time in air, not in the Zap.
