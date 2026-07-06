# Contract: Cupoane — quote/order extensions + admin CRUD

> Authored by: Agent (human approves; this file is the authoritative shape).
> Reads from: `01-spec.md`, `05-data-model.md`.
> Feeds into: `07-tasks.md`, the code, `08-quickstart.md`.
> Exact request/response shapes. The code conforms to this file — not the
> other way around. Error responses are part of the contract, not an
> afterthought.

## Common Rules

- Same conventions as the shop API (002/003/005 contracts): JSON in/out,
  prices **integer bani**, timestamps ISO-8601 with offset, zod at the
  boundary. Malformed shape → `400 {"error":"validation","issues":[…]}`.
  Semantic refusals → `422`. Admin endpoints: `401
  {"error":"unauthenticated"}` / `403 {"error":"forbidden_role"}` via
  `requireAdmin`.
- `couponCode` is accepted in ANY casing; the boundary normalizes (trim +
  uppercase) before it reaches services. Normalized format: 3–32 chars of
  `A–Z 0–9 -` — anything else is a `400` validation error, not a 422.
- Every quote/order response that involves a coupon reports the money as:
  the UNREDUCED `subtotalBani` / `sgrBani` / `deliveryFeeBani`, plus
  `discountBani ≥ 0`, with `totalBani` already discounted.

## `POST /api/cart/quote` (extended)

Request — one optional field added:

```json
{
  "mode": "delivery",
  "zoneSlug": "santana-de-mures",
  "items": [ { "productId": 3, "variantId": 7, "quantity": 1, "toppingIds": [] } ],
  "couponCode": "vara10"
}
```

Response `200` — `QuoteView` gains two fields (never the coupon id):

```json
{
  "quote": {
    "items": [ "…unchanged…" ],
    "subtotalBani": 5000,
    "sgrBani": 50,
    "deliveryFeeBani": 1500,
    "freeDeliveryGapBani": 2450,
    "discountBani": 500,
    "coupon": { "code": "VARA10", "type": "percent" },
    "totalBani": 6050
  }
}
```

- Without `couponCode` (or with it absent): `discountBani: 0`,
  `coupon: null` — every other byte identical to today (regression gate).
- `free_delivery`: `discountBani` equals `deliveryFeeBani` (may be 0 at
  pickup / at-or-above the zone threshold — D-h); `deliveryFeeBani` itself
  is UNCHANGED (the UI renders the fee as «gratuită (cupon)»).
- `freeDeliveryGapBani` keeps its pre-discount meaning (D-d).

Error `422` — four new reason codes join the existing contract, exactly one
is emitted per invalid coupon:

```json
{ "error": "invalid_cart", "reasons": [ { "code": "coupon_expired", "detail": "VARA10" } ] }
```

Codes: `coupon_unknown` | `coupon_inactive` | `coupon_not_started` |
`coupon_expired`. `detail` = the normalized code. These are NOT line
reasons: the client (`useQuote`) clears the stored coupon, shows the
per-code Romanian message, and re-quotes the untouched cart.

## `POST /api/orders` (extended)

Request: inherits the optional `couponCode` from the quote schema —
everything else unchanged. The server re-runs the quote (existing
behavior), so an invalid coupon at placement time answers the same `422
invalid_cart` reason codes above and NO order is created.

Response `201` — `PlacedOrderView` gains two fields:

```json
{
  "order": {
    "orderId": 130, "orderNumber": "…", "status": "new",
    "mode": "delivery", "scheduledFor": null, "estimateMinutes": null,
    "subtotalBani": 5000, "sgrBani": 50, "deliveryFeeBani": 1500,
    "discountBani": 500, "couponCode": "VARA10",
    "totalBani": 6050
  }
}
```

`discountBani: 0` + `couponCode: null` when no coupon was applied. The
order row additionally stores `coupon_id` (internal; never serialized).

## Order views (admin `GET /api/admin/orders/[id]`, account `GET /api/account/orders/[id]`) — extended

Both detail payloads gain the same two read-only fields on the order
object: `"discountBani": 500, "couponCode": "VARA10"` (0 / `null` without a
coupon). List payloads are unchanged (`totalBani` is already discounted).
Visible to BOTH staff roles (Q4: the angajat sees the discount on orders,
only the coupons SECTION is admin-only).

## `GET /api/admin/coupons`

`requireAdmin`. Response `200` — full rows, newest first:

```json
{
  "coupons": [
    {
      "id": 1, "code": "VARA10", "type": "percent", "value": 10,
      "startsAt": "2026-07-01T00:00:00.000Z", "endsAt": "2026-08-31T21:59:59.000Z",
      "active": true, "createdAt": "2026-07-06T12:00:00.000Z"
    }
  ]
}
```

`value` semantics by `type`: `percent` → 1–100; `fixed` → bani;
`free_delivery` → `null`.

## `POST /api/admin/coupons`

`requireAdmin`.

```json
{ "code": "vara10", "type": "percent", "value": 10,
  "startsAt": "2026-07-01T00:00:00.000Z", "endsAt": null }
```

- `code`: normalized at the boundary (→ `VARA10`), 3–32 `A–Z 0–9 -`.
- `type`: required enum. `value`: required int for `percent` (1–100) and
  `fixed` (≥ 1, bani); must be ABSENT or null for `free_delivery`.
- `startsAt`/`endsAt`: optional ISO timestamps (D-f); when both present,
  `startsAt < endsAt`.
- `active` is not accepted at create — new coupons are born active.

Response `201`: `{ "coupon": { …full row… } }`.

Errors: `422 {"error":"code_taken"}` (normalized-unique);
`422 {"error":"invalid_value_for_type"}`; `422 {"error":"invalid_window"}`;
`400` validation.

## `PATCH /api/admin/coupons/[id]`

`requireAdmin`. Partial body — any subset of `code`, `type`, `value`,
`startsAt`, `endsAt`, `active`:

```json
{ "active": false }
```

- The RESULTING row must satisfy the same rules (value-per-type re-checked
  against the effective type; window re-checked). Changing `type` without a
  compatible `value` in the same request → `422 invalid_value_for_type`.
- Code/value edits never touch existing orders (they hold snapshots — D-c).

Response `200`: `{ "coupon": { …full row… } }`.

Errors: `404 {"error":"not_found"}`; `422` as above; `400` validation.

## No DELETE endpoint

Retirement is `PATCH { "active": false }` (D-c). `orders.coupon_id` is
ON DELETE RESTRICT purely as a guard against manual SQL.

## Reason-code → UI message map (shared /cos + /comanda)

| code | Romanian message |
|---|---|
| `coupon_unknown` | «Codul introdus nu există.» |
| `coupon_inactive` | «Codul nu mai este activ.» |
| `coupon_not_started` | «Codul nu este încă activ.» |
| `coupon_expired` | «Codul a expirat.» |

The message is shown once, the invalid coupon is removed from the stored
cart state, and the quote/placement proceeds without it (spec FR4).
