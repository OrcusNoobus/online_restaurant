# Contract: Coș și plasare comandă — API

> Authored by: Agent (human approves; this file is the authoritative shape).
> Reads from: `01-spec.md`, `05-data-model.md`.
> Feeds into: `07-tasks.md`, the code, `08-quickstart.md`.
> Exact request/response shapes. The code conforms to this file — not the
> other way around. Error responses are part of the contract, not an afterthought.

## Common Rules

- Public endpoints, no authentication in v1; JSON in/out.
- All prices are **integer bani**; clients format for display and NEVER send
  prices — the server resolves everything from the database.
- Request bodies are zod-validated. Malformed shape → `400
  {"error":"validation","issues":[...zod issues...]}`. Semantically invalid
  content → `422 {"error":"<code>", ...}` with machine-readable codes listed
  per endpoint. Unexpected failure → `500 {"error":"internal"}`.
- These same services back the future chat/WhatsApp channels — nothing here
  assumes a browser.

## Changed: `GET /api/menu` (extends the feat-002 contract)

Each product gains `toppingGroups` (empty array when none). Existing fields
are unchanged; feat-002 consumers keep working.

```json
{
  "toppingGroups": [
    {
      "id": 3,
      "name": "Ambalaj",
      "required": true,
      "displayType": "radio",
      "toppings": [
        {
          "id": 7,
          "name": "Ambalaj",
          "sgrDepositBani": 0,
          "prices": [
            { "sizeName": "30 cm", "priceBani": 200 },
            { "sizeName": null, "priceBani": 200 }
          ]
        }
      ]
    }
  ]
}
```

- Only `active` toppings appear; `prices` resolve by the chosen variant's
  `name` (`sizeName: null` = the single/default variant).
- The UI uses these prices for PREVIEW only; the authoritative numbers come
  from `/api/cart/quote`.

## New: `GET /api/zones`

Active delivery zones for the checkout selector.

**Response `200`:**

```json
{
  "zones": [
    { "id": 1, "slug": "santana-de-mures", "name": "Sântana de Mureș",
      "feeBani": 2000, "freeFromBani": 4000 }
  ]
}
```

Sorted by `sortOrder`. Inactive zones never appear.

## New: `POST /api/cart/quote`

Stateless pricing of a client-held selection. No side effects; call it as
often as the cart changes.

**Request:**

```json
{
  "mode": "delivery",
  "zoneSlug": "santana-de-mures",
  "items": [
    { "productId": 10, "variantId": 101, "quantity": 2, "toppingIds": [7, 21] }
  ]
}
```

- `zoneSlug` required iff `mode = "delivery"`.
- `toppingIds` may be empty; duplicates are rejected.

**Response `200`:**

```json
{
  "items": [
    {
      "productId": 10, "variantId": 101, "quantity": 2,
      "productName": "Pizza Bambini", "variantName": "40 cm",
      "unitPriceBani": 4700,
      "options": [
        { "toppingId": 7, "groupName": "Ambalaj", "toppingName": "Ambalaj",
          "priceBani": 200, "sgrDepositBani": 0 }
      ],
      "lineTotalBani": 9800
    }
  ],
  "subtotalBani": 9800,
  "sgrBani": 0,
  "deliveryFeeBani": 0,
  "freeDeliveryGapBani": 0,
  "totalBani": 9800
}
```

- `sgrBani` = Σ option `sgrDepositBani` × quantity — the separate SGR line.
- Delivery: `(subtotalBani + sgrBani) >= zone.freeFromBani` → `deliveryFeeBani
  = 0`, else the zone fee; `freeDeliveryGapBani` = bani still missing for free
  delivery (0 when free or pickup) — powers the "mai adaugă X lei" hint.
- `totalBani = subtotalBani + sgrBani + deliveryFeeBani`, always.

**Errors `422`** — `{"error":"invalid_cart","reasons":[{"code":"...",
"itemIndex":0,"detail":"..."}]}` with codes: `empty_cart`,
`product_not_found`, `product_inactive`, `variant_mismatch` (variant not of
that product), `topping_not_allowed` (not in the product's groups),
`topping_inactive`, `missing_required_group` (+ `groupName` field),
`duplicate_topping`, `zone_required`, `zone_unknown`, `zone_inactive`.

## New: `POST /api/orders`

Validates, re-prices server-side (same engine as quote) and places the order
atomically.

**Request:** the quote request PLUS:

```json
{
  "customer": {
    "firstName": "Ion", "lastName": "Pop",
    "phone": "0740123456", "email": null
  },
  "addressStreet": "Str. Principală 10",
  "notes": "interfon 12",
  "scheduledFor": null,
  "pickupEstimateMinutes": null,
  "paymentMethod": "cash",
  "termsAccepted": true
}
```

- `addressStreet` required iff delivery. `scheduledFor` ISO timestamp or null
  (= ASAP). `pickupEstimateMinutes` (15 | 25) only for pickup + ASAP.
- `phone` accepted formats: `07XXXXXXXX` / `+407XXXXXXXX` (normalized to
  `+40...`). `termsAccepted` must be literally `true`.
- Client IP is read from request headers server-side, never from the body.

**Response `201`:**

```json
{
  "orderId": 123,
  "orderNumber": "#123",
  "status": "new",
  "mode": "delivery",
  "scheduledFor": null,
  "estimateMinutes": 60,
  "subtotalBani": 9800, "sgrBani": 0,
  "deliveryFeeBani": 2000, "totalBani": 11800
}
```

**Errors:**

- `422 invalid_cart` — exactly the quote codes above.
- `422 {"error":"invalid_order","reasons":[{"code":"..."}]}` with codes:
  `shop_closed` (placement outside 11:00–22:30 Europe/Bucharest),
  `schedule_out_of_hours` (scheduled before max(now + estimate, 11:30) or
  after 22:30, or not today), `payment_not_allowed_for_mode`,
  `invalid_phone`, `terms_not_accepted`.

## Logging (observability bar, ARCHITECTURE.md)

Every handler logs one structured line on success and failure:
`route=/api/orders outcome=created order_id=123 mode=delivery total_bani=11800 duration_ms=42`.
Failures include the reason codes; never any personal data in logs.
