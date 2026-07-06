# Data Model: Cupoane de reducere

> Authored by: Agent (human approves; contracts and code must match this file).
> Reads from: `01-spec.md`, `02-clarify.md`, `04-plan.md`.
> Feeds into: `06-contracts/`, `07-tasks.md`, the code.
> Single source of truth for entities, fields, rules, and lifecycle.
> If the code and this file disagree, one of them is a bug.

Extends the existing model (menu: 001, orders: 002, admin: 003, assistant:
004, accounts: 005). One new table + three new columns on `orders`.
Migration: `0007_feat011_coupons.sql`.

## Entity: Coupon

One promotional code defined by the admin (Q4). No usage counters exist in
v1 (Q3 — limits deferred); validity is the window + the `active` flag.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | |
| `code` | text | yes | — | UNIQUE; stored NORMALIZED (trim + uppercase, D-b); 3–32 chars `A–Z 0–9 -`; the customer may type any casing |
| `type` | enum `coupon_type` | yes | — | `percent` \| `fixed` \| `free_delivery` (Q1) |
| `value` | integer | no | null | `percent`: 1–100; `fixed`: bani ≥ 1; `free_delivery`: NULL |
| `startsAt` | timestamptz | no | null | NULL = valid immediately (D-f) |
| `endsAt` | timestamptz | no | null | NULL = until manually deactivated (D-f) |
| `active` | boolean | yes | true | the only retirement mechanism — no delete (D-c) |
| `createdAt` | timestamptz | yes | now() | |

Constraints:
- CHECK `coupons_value_by_type`:
  `(type = 'percent' AND value BETWEEN 1 AND 100) OR
   (type = 'fixed' AND value >= 1) OR
   (type = 'free_delivery' AND value IS NULL)`.
- CHECK `coupons_window`: `starts_at IS NULL OR ends_at IS NULL OR
  starts_at < ends_at`.
- UNIQUE on `code` (already normalized — no functional index needed).

Lifecycle: created by admin → optionally edited (any field; existing orders
are unaffected — they hold snapshots) → retired via `active = false`. Never
deleted by the application; `orders.coupon_id` is ON DELETE RESTRICT as a
guard against manual SQL mistakes.

Validity rule (evaluated in `quoteCart` against the injectable `now`):
`active AND (starts_at IS NULL OR starts_at <= now) AND (ends_at IS NULL OR
now <= ends_at)`. Failures map to exactly one reason: unknown code →
`coupon_unknown`; `active = false` → `coupon_inactive`; `now < starts_at` →
`coupon_not_started`; `now > ends_at` → `coupon_expired`.

## Changed Entity: Order (+3 columns)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `couponId` | integer FK → coupons | no | null | ON DELETE RESTRICT (like `zone_id`); reporting link («all orders that used X») |
| `couponCode` | text | no | null | SNAPSHOT of the normalized code at placement — survives later edits/renames of the coupon (D-c, feat-006 price-snapshot precedent) |
| `discountBani` | integer | yes | 0 | the applied reduction; 0 = no coupon or zero-effect free_delivery. `total_bani` already stored is the DISCOUNTED total |

Rules:
- The three fields are written together at insert, from the re-validated
  quote inside `placeOrder` — never from client input.
- Invariants at write: `discount_bani >= 0`; for `percent`/`fixed`:
  `discount_bani <= subtotal_bani`; for `free_delivery`: `discount_bani =
  delivery_fee_bani` (which may be 0 — D-h); `total_bani = subtotal_bani +
  sgr_bani + delivery_fee_bani − discount_bani >= 0`.
- `sgr_bani` is NEVER reduced (Q2). `delivery_fee_bani` keeps the zone fee
  actually assessed (pre-coupon) — the discount line carries the reduction.
- No index on `coupon_id` in v1: no read path filters by it (reporting is
  an ad-hoc owner query; add the index when a report page exists).

## Quote (transient, not stored — served by `quoteCart`)

`Quote` gains: `discountBani: number` (≥ 0) and `coupon: { id, code, type }
| null` (`id` consumed by `placeOrder` only; the client-facing `QuoteView`
exposes `{ code, type }`). `totalBani` is the discounted total everywhere.

## Not stored (by design)

- No usage/redemption counters, no per-customer usage state — Q3 deferred
  every limit; adding the columns now would imply a mechanism that does not
  exist (005 precedent).
- No minimum-order threshold on the coupon — same deferral (Q3).
- No coupon↔customer relation of any kind — coupons are anonymous codes;
  guest and logged-in orders store them identically (spec FR9).
- No raw (un-normalized) code spelling — one canonical form (D-b).
- No soft-delete/`deleted_at` — `active` is the lifecycle (D-c).
