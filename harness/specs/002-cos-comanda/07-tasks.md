# Tasks: Coș și plasare comandă

> Authored by: Agent (generated from the plan; human reviews order and size).
> Reads from: `04-plan.md`, `05-data-model.md`, `06-contracts/`.
> Feeds into: the working sessions; completion rolls up to `harness/feature-list.json`.
> The feature's execution checklist. The feature list tracks WHAT is done
> project-wide; this file tracks the steps WITHIN the active feature.

## Traceability Rule

Every task exists because of something in the spec, plan, data model, or
contract. If a task has no upstream source, it is scope creep — delete it or
take it back to the spec first.

## Sizing Rule

One task ≈ one focused session step ≈ one commit. If a task says only
"implement feature", it is too large. If completing it takes seconds, merge it.

## Task List (ordered by dependency)

- [x] T01 — Menu schema extensions + stable variant ids: topping_groups
      `required`/`display_type`/`sort_order`, toppings `sgr_deposit_bani`,
      unique `(product_id, name)` NULLS NOT DISTINCT on product_variants;
      migration; seed upserts variants by natural key (delete leftovers only
      when unreferenced), writes group fields, applies the SGR transform
      (Garanție SGR → price 0 + deposit 50; drink add-ons deposit 50 per
      02-clarify.md Q15 default); seed idempotency test still green from a
      feat-002-shaped database (source: 03-research D4/D5, 05-data-model)
      — done 2026-07-04: migration 0001 applied on the feat-002-shaped dev DB;
      seed ran twice → identical counts, variant ids stable (new test), SGR
      transform verified (9 toppings with deposit 50, SGR price rows zeroed);
      15/15 tests, lint + typecheck clean.
- [x] T02 — Delivery zones: `data/delivery-zones.json` (Q8 values, bani),
      delivery_zones table + migration, seed step, `zones.ts` repository,
      `GET /api/zones` + contract test (source: 05-data-model, 06-contracts)
      — done 2026-07-04: 6 zones seeded (migration 0002); tests cover seeded
      values, inactive-zone hiding, active-only-on-insert re-seed; 18/18 tests.
- [ ] T03 — Schedule module: `src/lib/restaurant-config.ts` (11:00–22:30,
      fulfillment ≥ 11:30, delivery 60 min, pickup 15/25, Europe/Bucharest) +
      pure `src/lib/schedule.ts` (isOpenNow, validateScheduledFor,
      estimateFor) + unit tests with fixed clocks (source: Q10/Q16,
      03-research D3)
- [ ] T04 — Extended menu payload: repository + `GET /api/menu` include
      toppingGroups per 06-contracts; adjust tests/menu.test.ts
      (source: 06-contracts)
- [ ] T05 — Pricing service: `src/lib/order-schemas.ts` (zod, shared),
      `services/pricing.ts` `quoteCart()` + `POST /api/cart/quote`;
      integration tests: per-size topping price, required groups, SGR sum,
      zone fee below/at threshold on ≥ 2 zones, pickup = no fee, every 422
      reason code (source: 01-spec FR1–FR3, 06-contracts)
- [ ] T06 — Order tables (orders, order_items, order_item_options + enums +
      CHECKs) + migration + `repositories/orders.ts` transactional insert
      (source: 05-data-model)
- [ ] T07 — Place order: `services/orders.ts` `placeOrder()` +
      `POST /api/orders` (schedule/payment/phone/terms validation, snapshots,
      client IP, structured logs); integration tests: happy path delivery +
      pickup, atomicity on failure, every invalid_order code
      (source: 01-spec FR4–FR7, 06-contracts)
- [ ] T08 — Options + cart UI: OptionsSheet from menu payload (radio/checkbox,
      required enforced, per-size preview prices), CartProvider (localStorage,
      quote-on-load reconciliation), cart page `/cos` with SGR line, delivery
      fee + "mai adaugă X lei" hint, header badge
      (source: 01-spec in-scope, 06-contracts quote)
- [ ] T09 — Checkout + confirmation UI: `/comanda` (mode, zone selector,
      schedule picker, guest form, payment methods per mode, T&C checkbox),
      placeholder legal pages `/termeni` + `/confidentialitate`, confirmation
      screen with `#id`; closed-shop state (source: 01-spec in-scope, Q14/Q16)
- [ ] T10 — Write `08-quickstart.md` manual flows and execute them on a 375px
      viewport (delivery below/above threshold, pickup, scheduled, closed
      hours); record evidence in `harness/feature-list.json`; Definition of
      Done layers 1–3 (source: 01-spec acceptance criteria)
