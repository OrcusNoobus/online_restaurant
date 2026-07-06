# Plan: Cupoane de reducere

> Authored by: Agent (the human reviews and approves before implementation).
> Reads from: `01-spec.md`, `02-clarify.md`, `03-research.md`, `harness/docs/ARCHITECTURE.md`.
> Feeds into: `05-data-model.md`, `06-contracts/`, `07-tasks.md`.
> The human decides architecture; the agent implements it.
> 03-research D1–D6 approved in full by the owner 2026-07-06, including the
> flagged default (free-delivery threshold compares the PRE-discount value —
> clarify D-d).

## Implementation Summary

Add a `coupons` table (normalized unique code, type percent/fixed/
free_delivery, per-type value CHECKs, optional validity window, active
flag) and teach the single money engine (`quoteCart`) an optional
`couponCode`: it resolves the code, emits `discountBani` (+ the applied
coupon's code/type) and subtracts it from `totalBani`. Invalid codes are
new granular `QuoteReason`s; the cart client auto-drops the coupon (never
the cart) with a Romanian notice, mirroring the existing line-drop pattern.
`placeOrder` re-validates for free (it already re-runs `quoteCart`) and the
order row snapshots `coupon_id` + `coupon_code` + `discount_bani`. Admin
gets a zones-style CRUD (`/api/admin/coupons`, `/admin/cupoane`,
admin-only). The coupon code lives in the localStorage cart store; /cos
gains the input, /cos + /comanda + confirmation + admin/account order
details gain the discount line. Verification: `npm test -- tests/coupons`
deterministic (injectable `now`), `tests/orders` as the no-regression gate,
manual 375px flow in `08-quickstart.md`.

## File Targets

Files this feature is expected to create or modify. Touching files outside
this list is a signal to stop and re-check scope.

Schema & data:
- `src/server/db/schema.ts` — `couponTypeEnum`, `coupons` table;
  `orders.coupon_id` / `coupon_code` / `discount_bani` (modify)
- `src/server/db/migrations/0007_feat011_coupons.sql` + meta — generated
  via `drizzle-kit generate` (new)

Pure logic (`src/lib`):
- `src/lib/order-schemas.ts` — `couponCodeSchema` (trim → uppercase, 3–32,
  `A–Z 0–9 -`); `quoteRequestSchema.couponCode` optional —
  `orderRequestSchema` inherits it (modify)
- `src/lib/quote-types.ts` — `QuoteView` gains `discountBani` +
  `coupon: { code, type } | null`; new `COUPON_REASON_CODES` set (modify)
- `src/lib/admin-schemas.ts` — `couponCreateSchema`, `couponPatchSchema`
  (per-type value rules mirrored from the service) (modify)

Server (repositories → services):
- `src/server/repositories/coupons.ts` — `getCouponByCode(normalized)`,
  `listAllCoupons`, `createCoupon`, `patchCoupon` (new)
- `src/server/services/pricing.ts` — coupon resolution (active + window vs
  injectable `now`), `discountBani` math per type (floor percent, capped
  fixed, fee-equal free_delivery), 4 new reason codes, `totalBani` −
  discount, extended `assertBani` guards (modify)
- `src/server/services/orders.ts` — pass `now` into the quote's coupon
  check; `NewOrder` carries `couponId`/`couponCode`/`discountBani` from the
  quote (modify)
- `src/server/repositories/orders.ts` — `insertOrder` writes the three new
  columns; admin + customer order-detail queries return them (modify)
- `src/server/services/admin-coupons.ts` — thin list/create/patch with
  per-type value validation and uniqueness mapping (new)
- `src/server/services/admin-orders.ts` — order views expose
  `couponCode`/`discountBani` (modify; view shape only)
- `src/server/services/customer-account.ts` — own-order detail view exposes
  the same two fields (modify; view shape only)

HTTP boundary:
- `src/app/api/admin/coupons/route.ts` — GET list + POST create,
  `requireAdmin` (new)
- `src/app/api/admin/coupons/[id]/route.ts` — PATCH, `requireAdmin` (new)
- (No new public routes: `/api/cart/quote` and `/api/orders` gain the
  optional field through the shared schemas.)

UI — shop:
- `src/components/cart/cart-store.ts` — `couponCode` in the stored cart +
  `setCoupon`/`clearCoupon`; cleared with the cart (modify)
- `src/components/cart/useQuote.ts` — sends `couponCode`; on
  `COUPON_REASON_CODES` clears the coupon, sets a notice, re-quotes
  (mirror of the line-drop path) (modify)
- `src/app/cos/page.tsx` — coupon input («Ai un cod de reducere?»),
  applied state (code + remove), discount line (modify)
- `src/app/comanda/page.tsx` — discount line; free_delivery renders the fee
  as «gratuită (cupon)»; coupon reason messages added to the 422 map
  (modify)
- `src/app/comanda/confirmare/page.tsx` — discount line from the stored
  order (modify)

UI — admin & account:
- `src/app/admin/(panel)/layout.tsx` — nav «Cupoane» in the admin-only
  block (modify)
- `src/app/admin/(panel)/cupoane/page.tsx` — admin page (new)
- `src/components/admin/CouponsTable.tsx` — list + create + edit/deactivate
  forms, ZonesTable pattern (new)
- `src/components/admin/OrderDetailPanel.tsx` + `src/components/admin/types.ts`
  — discount + code line in the money block (modify)
- `src/app/cont/comenzi/[id]/page.tsx` — discount line (modify)

Tests:
- `tests/coupons.test.ts` — integration suite (new)

## Technical Design

- **Normalization (D-b):** ONE function `normalizeCouponCode` (trim +
  uppercase) lives in `src/lib/order-schemas.ts` and is applied by the zod
  schemas on BOTH the public `couponCode` and the admin create/patch `code`
  — the DB only ever sees the normalized form; `getCouponByCode` does an
  exact match on it. Format: 3–32 chars of `A–Z 0–9 -` after normalization.
- **Engine changes (D2/D3):** `quoteCart` resolves the coupon AFTER items
  and zone (needs `subtotalBani`/`deliveryFeeBani`). Validity: `active AND
  (starts_at IS NULL OR starts_at <= now) AND (ends_at IS NULL OR now <=
  ends_at)` — `quoteCart` gains an optional `now` param (defaults to
  `new Date()`); `placeOrder` passes its existing `context.now` so tests
  drive the clock end-to-end. Reasons: `coupon_unknown`, `coupon_inactive`,
  `coupon_not_started`, `coupon_expired`. Math (integer bani): percent →
  `Math.floor(subtotalBani * value / 100)`; fixed → `Math.min(value,
  subtotalBani)`; free_delivery → `deliveryFeeBani` (0 at pickup / at-or-
  above threshold — accepted, D-h). Threshold comparison (pricing.ts:196)
  UNCHANGED — pre-discount (D-d, owner-approved). `totalBani = subtotal +
  sgr + deliveryFee − discount`; invariants: `discountBani ≥ 0`,
  `totalBani ≥ 0` by construction, both `assertBani`-guarded. `Quote` gains
  `discountBani` and `coupon: { id, code, type } | null` (id used by
  placeOrder, never serialized to the client view).
- **Order snapshot (D1):** `placeOrder` copies `quote.coupon?.id`,
  `quote.coupon?.code`, `quote.discountBani` into `NewOrder`; `insertOrder`
  writes them in the same transaction as today. No counters, no extra
  atomicity (Q3: no usage limits).
- **Admin service rules (D4):** create/patch validate value-per-type:
  percent → int 1–100; fixed → int ≥ 1 (bani); free_delivery → value must
  be absent/null. Window: optional ISO timestamps, `starts_at < ends_at`
  when both present (422 `invalid_window`). Duplicate normalized code →
  422 `code_taken`. PATCH may change everything except… nothing — code
  edits are allowed too (orders keep their snapshot); retirement =
  `active: false`; NO delete route (RESTRICT FK guards manual SQL
  mistakes).
- **Client flow (D5):** the cart store persists `{ items, couponCode }`;
  `setCoupon` replaces any previous code (D-a). `useQuote` includes the
  code in the POST body; a 422 whose reasons include a coupon code splits
  handling: coupon reasons clear the stored coupon + set `couponNotice`
  (per-code Romanian message), line reasons keep today's drop behavior,
  then re-quote. /cos input: discreet disclosure («Ai un cod de
  reducere?») expanding to input + «Aplică»; applied state shows
  `CODE − value` with a remove ✕. /comanda adds the coupon codes to
  `orderReasonMessages` for placement-time 422s. Placement success clears
  the coupon together with the cart (existing clear path).
- **Free-delivery display:** when `coupon.type === "free_delivery"` and
  `deliveryFeeBani > 0`, the fee line shows «gratuită (cupon)» and NO
  separate discount line (the discount equals the fee — showing both would
  double-count visually); percent/fixed show the standard discount line
  «Reducere (COD): −X lei». Order-record views (admin, account,
  confirmation) always show the raw stored numbers: fee + discount lines.
- **Romanian messages (per reason):** unknown → «Codul nu există.»;
  inactive → «Codul nu mai este activ.»; not_started → «Codul nu este încă
  activ.»; expired → «Codul a expirat.» — exact copy at implementation,
  one message map shared by /cos and /comanda.
- **Observability:** one structured log line when a coupon is applied at
  placement (`coupon=<code> discount=<bani> order=<id>`) — mirrors the
  existing placement log; nothing sensitive involved.
- **Testing (D6):** `tests/coupons.test.ts` on the standard harness; the
  suite creates its own coupons via the admin service/routes, drives the
  clock via `now`, and cleans up. Role matrix hits all three
  `/api/admin/coupons*` handlers as both roles. The no-coupon path is
  covered by leaving `tests/orders` untouched AND one explicit
  "quote without couponCode is unchanged" assertion.

## Design Constraints

Out of scope (verbatim from 01-spec.md): limite de utilizare (număr total,
per client), valoare minimă de comandă, cupoane în chat/canale externe,
stacking, cupoane automate/pe produs/categorie, loialitate, generare în
masă, distribuție/marketing.

ARCHITECTURE.md constraints touched: zod at every boundary; money only in
integer bani inside the services layer; role rules at the HTTP boundary
(`requireAdmin`); `src/components` never imports `@/server` (cart/admin
components speak to `/api/*` only); business logic in services — routes
validate → call → shape.

NOT touched: the assistant (its tool schemas exclude `couponCode` — D-e),
the seed (coupons are never seeded), staff auth, menu/catalog logic, the
free-delivery threshold rule (D-d), `src/proxy.ts`.

## Risks

- **Money-engine regression:** pricing.ts is shared by every channel. Gate:
  `tests/orders` (22) + `tests/assistant` + full suite green; the
  no-couponCode code path adds zero DB queries (coupon lookup only runs
  when a code is present).
- **Cart-store shape change:** localStorage payload gains a field — old
  stored carts must parse (missing `couponCode` → null; `parseStoredCart`
  already tolerates unknown/missing fields — verify in T-tests).
- **UI clutter on 375px:** the coupon input is a collapsed disclosure in
  /cos; quickstart re-checks the cart remains one-screen usable.
- **Admin typo risk:** value semantics differ per type (percent vs bani) —
  the admin form labels units explicitly («%» / «lei», converting lei→bani
  at the boundary like zone fees) and the service re-validates.

## Validation Checklist

Confirm before generating `07-tasks.md`:

- [x] Every acceptance criterion in `01-spec.md` has a verification command
      (`npm test -- tests/coupons`; `tests/orders` for the no-coupon
      regression; quickstart for the 375px manual flow).
- [x] Every file target is named above.
- [x] Every entity this feature touches is defined in `05-data-model.md`.
- [x] Every endpoint this feature exposes is defined in `06-contracts/api.md`.
- [x] Nothing contradicts `AGENTS.md`, `harness/docs/ARCHITECTURE.md`, or
      the spec's out-of-scope list.
- [x] Every `02-clarify.md` question is answered; defaults D-a…D-h are
      recorded and owner-approved (2026-07-06) — no open coin flips.
