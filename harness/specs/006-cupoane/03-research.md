# Research: Cupoane de reducere

> Authored by: Agent (human approves each decision).
> Reads from: `01-spec.md`, `02-clarify.md`.
> Feeds into: `04-plan.md`; durable decisions get promoted to `harness/docs/DECISIONS.md`.
> Records feature-level technical choices and WHY they were made, so no later
> session quietly re-decides them.
> Baseline verified before research: `./init.sh` green 2026-07-06 (198 tests,
> 1 skip — assistant live smoke, key-gated by design).
> D1–D6 implement the owner's answers Q1–Q4 and the recorded defaults D-a…D-h
> from `02-clarify.md`; one soft default is flagged for owner review (D2's
> threshold rule = clarify D-d).

## Decision 1: One `coupons` table; the order stores a snapshot (code + discount) plus a RESTRICT FK

- **Options considered:**
  - A: `coupons` + a `coupon_redemptions` join table counting uses.
  - B: one `coupons` table; `orders` gains `coupon_id` (nullable FK),
    `coupon_code` (text snapshot) and `discount_bani` (int, default 0).
- **Decision:** B.
- **Reason:** Q3 dropped every usage limit from v1 — with no counters there
  is nothing for a redemptions table to record that the order row does not
  already hold. The snapshot pair (code + discount) follows the feat-006
  precedent of copying prices onto the order at placement: renaming or
  editing a coupon later never changes what an existing order says it got.
  The FK exists purely for reporting ("all orders that used X").
- **Consequences:** migration `0007_feat011_coupons.sql`: table `coupons`
  (`id` serial PK, `code` text unique — stored NORMALIZED (trim + uppercase,
  D-b), `type` new enum `coupon_type` = `percent | fixed | free_delivery`
  (Q1), `value` int — percent 1–100 / bani for fixed / NULL for
  free_delivery, with CHECK constraints per type (precedent: `has_credential`
  CHECK, 0006), `starts_at` / `ends_at` timestamptz nullable (D-f), `active`
  boolean default true, `created_at`); `orders.coupon_id` FK ON DELETE
  RESTRICT (like `zone_id`, schema.ts:192 — no delete endpoint exists, the
  constraint guards manual mistakes; deactivation is the only retirement
  path, D-c), `orders.coupon_code`, `orders.discount_bani` int NOT NULL
  default 0. Exact columns at 05-data-model.

## Decision 2: The discount is computed INSIDE `quoteCart` — one new output field, every type expressed as `discountBani`

- **Options considered:**
  - A: a separate "apply coupon" service that post-processes a finished
    quote wherever a channel wants it.
  - B: `quoteCart` (src/server/services/pricing.ts:71) accepts an optional
    `couponCode`, resolves it against the DB like it already resolves zones
    (pricing.ts:77–96), and emits `discountBani` (+ the resolved coupon) in
    the `Quote`; `totalBani = subtotal + sgr + deliveryFee − discount`
    (pricing.ts:203 extended).
- **Decision:** B.
- **Reason:** pricing.ts is "the single money engine for every channel"
  (its own header, DECISIONS.md 2026-07-04) — a post-processor (A) would be
  a second place where totals are made, exactly what that decision forbids.
  `placeOrder` re-runs `quoteCart` before insert (orders.ts:51), so
  re-validation at placement (spec FR5) comes for free through the same
  path, no second implementation.
- **Consequences:** math per type (all integer bani, `assertBani` guards
  extended): `percent` → `floor(subtotalBani * p / 100)` (D-g); `fixed` →
  `min(valueBani, subtotalBani)` (never negative, spec FR2); `free_delivery`
  → `discountBani = deliveryFeeBani` (0 at pickup or at/above the zone
  threshold — accepted with zero effect, D-h). The fee line itself stays
  intact in the engine and on the order record; the UI presents it as
  «gratuită (cupon)» for free_delivery, so the spec's customer-visible
  outcome ("taxa devine 0") holds while the money model keeps ONE mechanism
  for all three types and order rows keep honest history (fee charged −
  discount granted). SGR is never touched (Q2): the discount reads ONLY
  `subtotalBani` / `deliveryFeeBani`.
  **Flagged default (owner may override — clarify D-d):** the free-delivery
  THRESHOLD comparison stays on the PRE-discount value (`subtotal + SGR`,
  pricing.ts:196 unchanged): applying a coupon can never make a delivery fee
  APPEAR. Simple to explain, zero change to existing threshold behavior.

## Decision 3: Invalid coupons are QuoteReasons; the client auto-drops the coupon, never the cart

- **Options considered:** A: an invalid coupon fails the quote with a
  dedicated reason code (existing 422 contract) and the cart UI removes the
  coupon + shows the message, then re-quotes; B: the quote succeeds with
  `coupon: null` plus a warning field (new partial-success shape in the
  contract).
- **Decision:** A.
- **Reason:** the engine already has exactly this shape for cart lines: 422
  + reason codes, and `useQuote` auto-drops offending lines via
  `LINE_REASON_CODES` (src/lib/quote-types.ts:63–72, useQuote.ts:72–108)
  with a Romanian notice. A parallel "warning" channel (B) would be a second
  error contract to document and test. Spec FR4 ("coșul rămâne complet
  utilizabil fără cupon") is satisfied by the client dropping the coupon the
  same way it drops a deactivated product.
- **Consequences:** new `QuoteReason` codes `coupon_unknown`,
  `coupon_inactive`, `coupon_not_started`, `coupon_expired` (granular like
  the zone codes — the UI message differs per case, spec FR4); a
  `COUPON_REASON_CODES` set on the client drops the stored coupon and shows
  the mapped Romanian message (mapping pattern: comanda/page.tsx:57–62). At
  placement the same codes surface as the existing 422 contract — an order
  is never silently placed at a different price than quoted. Validity check:
  `active AND (starts_at IS NULL OR starts_at <= now) AND (ends_at IS NULL
  OR now <= ends_at)`, evaluated against the injectable `now`
  (PlaceOrderContext.now, orders.ts:43) for deterministic tests. With no
  usage counters in v1 (Q3) there is no exhaustion race to guard — the
  placement-time re-validation window (ms between orders.ts:51 and :127) is
  the same one already accepted for product price edits.

## Decision 4: Admin CRUD mirrors the zones template; a dedicated `admin-coupons` service, repository-resolved by pricing

- **Decision:** repository `src/server/repositories/coupons.ts`
  (`getCouponByCode` for pricing, `listAllCoupons` / `createCoupon` /
  `patchCoupon` for admin); thin service `src/server/services/admin-coupons.ts`
  (value-per-type validation); routes `GET|POST /api/admin/coupons` and
  `PATCH /api/admin/coupons/[id]` guarded by `requireAdmin` at the route
  boundary (auth.ts:164–169; pattern: api/admin/zones/route.ts:13,30 — Q14
  feat-007: role rules live at the HTTP boundary, services stay
  actor-agnostic); Zod schemas `couponCreateSchema` / `couponPatchSchema` in
  `src/lib/admin-schemas.ts`; admin UI page `/admin/cupoane` +
  `CouponsTable` component mirroring `ZonesTable`, nav entry in the
  admin-only block (admin/(panel)/layout.tsx:28) so the angajat never sees
  the section (Q4) but keeps seeing order money lines (the order detail
  gains a discount + code line, visible to both roles).
- **Reason:** zones are the proven smallest admin CRUD in this repo (route +
  service + repo + table UI, no delete — deactivate only); coupons have the
  same shape and inherit the same conventions instead of inventing new ones.
  Coupons are NOT seeded, so none of admin-catalog's seed-protection
  flagging applies — a separate small service keeps admin-catalog's
  "protected catalog" semantics undiluted.
- **Consequences:** no DELETE endpoint (retirement = `active: false`);
  code-uniqueness violations surface as a 409/422 with a clear admin
  message; code format fixed at plan (proposal: 3–32 chars, `A–Z 0–9 -`,
  normalized uppercase). The public menu/quote surface exposes NOTHING about
  coupons except the applied result — no coupon listing API exists for
  clients (codes are distributed offline by the owner).

## Decision 5: Client surface — the coupon code lives in the cart store; both `/cos` and `/comanda` show the discount line

- **Decision:** `couponCode` joins the localStorage cart state
  (src/components/cart/cart-store.ts, useSyncExternalStore) next to `items`;
  `useQuote` (useQuote.ts:57 — POST /api/cart/quote) sends it when present;
  `quoteRequestSchema` gains optional `couponCode`
  (src/lib/order-schemas.ts:17–21) and `orderRequestSchema` inherits it —
  POST /api/orders needs no new field beyond that. The cart page (/cos)
  gains the input («Ai un cod de reducere?» — discreet when empty, NFR) and
  the applied state (code + remove button + discount line); the checkout
  (/comanda, totals at comanda/page.tsx:442–471) renders the discount line
  and, for free_delivery, the fee as «gratuită (cupon)»; the confirmation
  page shows the same lines from the stored order. Entering a second code
  replaces the first (D-a: exactly one coupon).
- **Reason:** the cart already owns exactly this kind of client state
  (items survive navigation and reload; the coupon must too, or it silently
  disappears between /cos and /comanda). Sending the code through the
  existing quote/order request keeps the server the only calculator (spec
  NFR) — the client never sees coupon definitions, only the priced result.
- **Consequences:** the cart page quotes with `mode: "pickup"` hardcoded
  (cos/page.tsx:15–17), so a free_delivery coupon shows 0 reduction there —
  the input's helper text says the delivery reduction applies at checkout
  (D-h honest display); the real effect appears on /comanda once
  mode/zone are chosen. Placing the order or emptying the cart clears the
  stored coupon. Assistant untouched (clarify D-e): `couponCode` is optional
  end-to-end and the assistant's tool schemas simply do not include it.

## Decision 6: Verification — `npm test -- tests/coupons` + quickstart; feat-006 suites are the no-regression gate

- **Decision:** new `tests/coupons.test.ts` on the existing harness
  (self-migrate, self-seed, direct service + route calls, cleanup — same as
  accounts/admin): percent math incl. floor rounding; fixed capped at
  subtotal (total never negative, SGR + fee still due); free_delivery below
  threshold vs at/above threshold vs pickup (0 effect); SGR untouched by
  every type; threshold-on-pre-discount rule (D-d); validity matrix
  (unknown / inactive / not_started / expired → exact reason codes);
  case-insensitive code match; placement snapshot (order stores code +
  discount + FK) and re-validation (coupon deactivated after quote →
  placement 422); admin CRUD + role matrix BOTH directions (admin 200,
  angajat 403 on every /api/admin/coupons route; angajat still sees the
  discount on an order detail); quote/order WITHOUT coupon byte-identical to
  today (plus `npm test -- tests/orders` 22/22 as the standing regression
  gate — spec acceptance). Manual 375px flow in `08-quickstart.md`: apply a
  percent code in the cart, see the line, place the order, find code +
  discount in the admin order detail, try an expired code and read the
  message.
- **Reason:** every acceptance criterion in 01-spec maps 1:1 onto a named
  deterministic test; nothing needs a network, a secret, or a clock — `now`
  is injectable (D3), so `./init.sh` stays green offline (AGENTS.md critical
  rule 4).
- **Consequences:** `harness/feature-list.json` verification is already set
  to `npm test -- tests/coupons` (recorded at spec commit).

## Notes

- **No new dependencies, no new reference docs** — everything reuses
  Drizzle, Zod and the in-repo patterns cited above.
- **Migration path:** `drizzle-kit generate` from schema.ts →
  `0007_feat011_coupons.sql` (journal + snapshot as in 0006); runner
  unchanged (`npm run db:migrate`, drizzle.config.ts:6).
- **Money invariants extended, not changed:** `assertBani` also guards
  `discountBani`; the engine asserts `discountBani <= subtotalBani +
  deliveryFeeBani` and `totalBani >= 0` by construction (percent ≤ 100,
  fixed capped, free_delivery = fee).
- **Reporting stays in the panel:** the admin order detail shows
  `coupon_code` + `discount_bani`; no separate coupons report/analytics in
  v1 (out of scope — the owner can query usage per code when needed; a
  report page is a future nice-to-have).
- **Seed untouched:** coupons are owner-created data, never seeded — the
  feat-007 seed guard is irrelevant to them by construction.
- **Promotion candidates for `harness/docs/DECISIONS.md`:** none — every
  choice here is feature-local application of already-promoted decisions
  (single money engine per DECISIONS 2026-07-04; role rules at the HTTP
  boundary per feat-007 Q14; snapshot-on-order per feat-006). If feat-012
  (plată online) later needs discount-aware payment amounts, it reads
  `orders.total_bani` and is unaffected.
