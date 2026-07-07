# Tasks: Cupoane de reducere

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

- [x] T01 — Schema migration 0007 + coupons repository: `couponTypeEnum`,
      `coupons` table (+ `coupons_value_by_type` and `coupons_window`
      CHECKs, UNIQUE code), `orders.coupon_id` (FK RESTRICT) /
      `coupon_code` / `discount_bani` per 05-data-model; `drizzle-kit
      generate`; `repositories/coupons.ts` (`getCouponByCode`,
      `listAllCoupons`, `createCoupon`, `patchCoupon`). First
      `tests/coupons.test.ts` cases: coupon round-trip, normalized-unique
      code, both CHECKs enforced (source: 05-data-model).
- [x] T02 — Admin coupons service + boundary schemas:
      `src/lib/admin-schemas.ts` (`couponCreateSchema`/`couponPatchSchema`
      with `normalizeCouponCode`), `services/admin-coupons.ts` (list /
      create / patch; `code_taken`, `invalid_value_for_type`,
      `invalid_window`; resulting-row re-validation on patch). Tests:
      value-per-type matrix (percent 0/101 rejected, fixed 0 rejected,
      free_delivery with value rejected), window rule, duplicate code,
      patch type/value consistency (source: 06-contracts admin; 04-plan).
- [x] T03 — Money engine: `couponCodeSchema` + optional `couponCode` on
      `quoteRequestSchema` (order schema inherits); `quoteCart` gains
      `now` param + coupon resolution → `discountBani` + `coupon` on
      `Quote`, 4 reason codes, `totalBani` − discount, invariant asserts;
      `QuoteView` fields + `COUPON_REASON_CODES` in quote-types. Tests:
      percent floor math, fixed capped at subtotal, free_delivery below /
      at threshold / pickup (0 effect), SGR never touched, threshold
      pre-discount (D-d), validity matrix incl. window edges driven by
      `now`, case-insensitive input, quote WITHOUT couponCode byte-
      identical (source: 03-research D2/D3; 06-contracts quote).
- [x] T04 — Placement snapshot: `placeOrder` forwards `context.now` to the
      quote and copies `coupon.id`/`code`/`discountBani` into `NewOrder`;
      `insertOrder` writes the three columns; `PlacedOrderView` +
      admin/account order-detail views gain `discountBani`/`couponCode`;
      placement log line. Tests: order row snapshot (incl. FK), placement
      re-validation (deactivate after quote → 422, no order row), guest
      and logged-in identical, `npm test -- tests/orders` still 22/22
      (source: 03-research D1; 06-contracts orders/views).
- [x] T05 — Admin HTTP boundary: `GET|POST /api/admin/coupons`,
      `PATCH /api/admin/coupons/[id]`, `requireAdmin` at the route.
      Route-layer tests: status mapping (400/401/403/404/422), role
      matrix BOTH directions on all three handlers (admin 200 / angajat
      403), angajat still reads a discounted order's detail
      (source: 06-contracts admin; spec FR6).
- [ ] T06 — Admin UI: nav «Cupoane» in the admin-only block
      (layout.tsx), `/admin/cupoane` page + `CouponsTable` (list, create
      with per-type value units «%»/«lei», edit, activate/deactivate —
      ZonesTable pattern); `OrderDetailPanel` + admin types: discount +
      code line in the money block. Gate: lint + typecheck + build;
      behavior proven in T08 flows (source: 04-plan UI admin; Q4).
- [ ] T07 — Shop UI: `cart-store` gains persisted `couponCode`
      (+ set/clear, cleared with the cart, old stored carts still parse);
      `useQuote` sends the code and auto-drops it on coupon reasons with
      the per-code Romanian notice; `/cos` input («Ai un cod de
      reducere?» disclosure) + applied state + discount line; `/comanda`
      discount line, «gratuită (cupon)» fee display, coupon codes in the
      422 message map; confirmation page + `/cont/comenzi/[id]` discount
      line. Gate: lint + typecheck + build; behavior proven in T08 flows
      (source: 04-plan UI shop; 06-contracts message map; spec FR1/FR4).
- [ ] T08 — Quickstart + close-out: `08-quickstart.md` written AND
      executed at 375px (create coupons of all 3 types in admin as admin;
      angajat cannot see the section; apply percent code in cart → line
      visible → place order → code + discount in admin order detail;
      fixed > subtotal capped; free_delivery under threshold at checkout;
      expired + unknown code messages; order without coupon unchanged);
      `09-debug.md`; evidence in `harness/feature-list.json`; harness
      bookkeeping (source: spec acceptance criteria; 03-research D6).

## Notes

- `npm test -- tests/coupons` is the feature verification command —
  matches `tests/coupons.test.ts` and any `coupons-*.test.ts` route file.
- T01–T05 are backend and fully verifiable offline; T06–T07 need the
  browser at T08. No secrets, no external services anywhere in this
  feature.
- Money-engine regression gate applies to EVERY task from T03 on:
  `tests/orders` (22) + full suite green before each commit.
