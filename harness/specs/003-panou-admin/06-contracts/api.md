# Contract: Panou admin — API

> Authored by: Agent (human approves; this file is the authoritative shape).
> Reads from: `01-spec.md`, `05-data-model.md`.
> Feeds into: `07-tasks.md`, the code, `08-quickstart.md`.
> Exact request/response shapes. The code conforms to this file — not the
> other way around. Error responses are part of the contract, not an afterthought.

## Common Rules

- Every `/api/admin/*` endpoint except `auth/login` requires the session
  cookie. Missing/invalid/expired session → `401 {"error":"unauthenticated"}`.
  Valid session but insufficient role → `403 {"error":"forbidden_role"}`.
  The Q14 matrix in `05-data-model.md` says which endpoints are admin-only.
- Session cookie: `rf_admin_session`, httpOnly, `SameSite=Lax`, `Secure` in
  production, path `/`; value = opaque 32-byte base64url token; rolling
  7-day expiry.
- JSON in/out; all prices **integer bani**; timestamps ISO-8601 with offset.
- Zod-validated bodies/params. Malformed shape → `400
  {"error":"validation","issues":[...]}`. Semantically invalid → `422
  {"error":"<code>"}` with codes listed per endpoint. Lost race against a
  concurrent device → `409 {"error":"stale_state",...}`. Not found → `404
  {"error":"not_found"}`. Unexpected → `500 {"error":"internal"}`.
- These services back the panel today and the POS integration tomorrow
  (clarify Q12 note) — nothing assumes a browser except the cookie transport.

## Auth

### `POST /api/admin/auth/login`

Request: `{"username": "ana", "password": "..."}`
- `200` → `{"user":{"id":1,"username":"ana","displayName":"Ana","role":"admin"}}`
  + `Set-Cookie: rf_admin_session=...`
- `401 {"error":"invalid_credentials"}` — unknown user, wrong password, or
  deactivated account (indistinguishable on purpose).
- `429 {"error":"too_many_attempts"}` — per IP+username in-memory limiter.

### `POST /api/admin/auth/logout`

- `204` — session row deleted, cookie cleared. Idempotent.

### `GET /api/admin/auth/me`

- `200 {"user":{...}}` (same shape as login) — also the poller's cheap
  session keep-alive.

## Orders

### `GET /api/admin/orders?date=YYYY-MM-DD&status=<order_status>`

Day view (03-research D3/D10). `date` defaults to today in Europe/Bucharest;
`status` optional filter. The client polls this every ~5s.

```json
{
  "date": "2026-07-05",
  "orders": [
    {
      "id": 19, "createdAt": "...", "mode": "pickup", "status": "new",
      "customerName": "Ion Pop", "phone": "+40712345678",
      "zoneName": null, "scheduledFor": null, "estimateMinutes": 25,
      "paymentMethod": "card_restaurant", "totalBani": 5250
    }
  ],
  "totals": { "count": 12, "totalBani": 84300, "canceledCount": 1 }
}
```

- `orders` sorted newest-first; `totals` covers the WHOLE day regardless of
  the `status` filter; `count`/`totalBani` exclude canceled orders,
  `canceledCount` reports them separately (clarify Q11).
- The new-order alert derives client-side from `status === "new"` entries.

### `GET /api/admin/orders/:id`

Full detail: every order column (as placed, snapshots included), `items` with
their `options`, and the event journal:

```json
{
  "order": { "id": 19, "status": "accepted", "estimateMinutes": 35, "...": "..." },
  "items": [ { "productName": "Pizza Royal", "variantName": "40 cm",
               "quantity": 1, "unitPriceBani": 4500, "lineTotalBani": 5250,
               "options": [ { "groupName": "Ambalaj", "toppingName": "Cutie",
                              "priceBani": 200, "sgrDepositBani": 0 } ] } ],
  "events": [ { "id": 7, "fromStatus": "new", "toStatus": "accepted",
                "reason": null, "staffDisplayName": "Ana", "createdAt": "..." } ]
}
```

### `POST /api/admin/orders/:id/transition`

Request: `{"to":"accepted","estimateMinutes":45}` |
`{"to":"in_delivery"}` | `{"to":"ready_for_pickup"}` | `{"to":"completed"}` |
`{"to":"canceled","reason":"clientul nu răspunde"}`

- `200` → the updated `GET /api/admin/orders/:id` payload.
- `422` codes: `invalid_transition` (not allowed by the graph for this
  order's mode/state), `cancel_reason_required` (to=canceled without a
  non-empty reason), `estimate_not_allowed` (`estimateMinutes` present but
  `to !== "accepted"`).
- `409 {"error":"stale_state","currentStatus":"..."}` — the order's status
  changed since the client last read it (concurrent device). The status
  update is a conditional `UPDATE … WHERE status = <expected from>`; zero
  rows → 409, nothing written. The UI refetches and re-renders the valid
  actions.
- `estimateMinutes` optional on `to="accepted"`: integer > 0; omitted →
  the estimate quoted at placement stays.

### `POST /api/admin/orders/:id/undo`

Empty body. Reverts the order to the latest event's `fromStatus`, recording a
compensating event marked with `undoOfEventId` (05-data-model Lifecycle).

- `200` → updated detail payload.
- `422 {"error":"nothing_to_undo"}` — order has no events, or the latest
  event is itself an undo (an undo cannot be undone — no redo ping-pong;
  move forward with normal transitions instead).
- `409 {"error":"stale_state","currentStatus":"..."}` — same conditional
  rule as transitions.

## Catalog (role rules per Q14 — staff may ONLY toggle `active` on products / variants / toppings)

### `GET /api/admin/catalog` (staff + admin)

The admin's read view: the FULL catalog including inactive entities — the
public `GET /api/menu` hides them, so the panel cannot edit from it.

```json
{
  "categories": [ { "id": 3, "name": "Pizza", "sortOrder": 10, "active": true,
    "products": [ { "id": 41, "name": "Pizza Royal", "description": "…",
      "ingredients": "…", "allergens": "…", "active": true, "sortOrder": 5,
      "variants": [ { "id": 88, "name": "30 cm", "priceBani": 3500,
                      "active": true, "sortOrder": 0 } ],
      "toppingGroupIds": [1, 2] } ] } ],
  "toppingGroups": [ { "id": 1, "name": "Ambalaj", "required": true,
    "displayType": "radio", "sortOrder": 0,
    "toppings": [ { "id": 9, "name": "Cutie", "sgrDepositBani": 0,
      "active": true, "prices": [ { "sizeName": null, "priceBani": 200 } ] } ] } ]
}
```

### `POST /api/admin/categories` (admin)

`{"name":"Deserturi","sortOrder":90}` → `201 {"category":{...}}` (slug
generated server-side, unique). `422 name_taken` on duplicate name/slug.

### `PATCH /api/admin/categories/:id` (admin only — categories are NOT in
the staff availability matrix, Q14)

Any subset of `{"name","sortOrder","active"}` → `200 {"category":{...}}`.

### `POST /api/admin/products` (admin)

```json
{
  "categoryId": 3, "name": "Pizza Quattro", "description": "…",
  "ingredients": "…", "allergens": "gluten, lactoză",
  "variants": [ {"name":"30 cm","priceBani":3500}, {"name":"40 cm","priceBani":4900} ],
  "toppingGroupIds": [1, 2, 5]
}
```

- ≥ 1 variant required (single-size → one variant, `name: null`); prices > 0.
- `201 {"product":{...full product with variants and groups...}}`
- `422` codes: `name_taken`, `category_not_found`, `topping_group_not_found`.

### `PATCH /api/admin/products/:id`

- admin: any subset of `{"name","description","ingredients","allergens",
  "categoryId","sortOrder","active"}`.
- staff: `{"active": boolean}` and NOTHING else — any other key → `403
  {"error":"forbidden_role"}`.
- `200 {"product":{...}}`.

### `PATCH /api/admin/variants/:id`

- admin: subset of `{"name","priceBani","sortOrder","active"}` (priceBani > 0).
- staff: `{"active"}` only.
- `200 {"variant":{...}}`. Deactivating the LAST active variant of an active
  product is allowed — the product then disappears from the menu payload
  (documented behavior, not an error).

### `PATCH /api/admin/toppings/:id`

- admin: subset of `{"name","sgrDepositBani","active","prices":[{"sizeName":
  "30 cm"|null,"priceBani":0}]}` — `prices` upserts by `(topping, sizeName)`.
- staff: `{"active"}` only.
- `200 {"topping":{...with prices...}}`.

## Zones (admin only)

### `GET /api/admin/zones`

`200 {"zones":[...]}` — ALL zones including inactive (the public
`GET /api/zones` keeps returning active only).

### `POST /api/admin/zones`

`{"name":"Ceuașu de Câmpie","feeBani":4000,"freeFromBani":15000,"sortOrder":70}`
→ `201 {"zone":{...}}` (slug server-side). `422 name_taken`.

### `PATCH /api/admin/zones/:id`

Subset of `{"name","feeBani","freeFromBani","sortOrder","active"}` →
`200 {"zone":{...}}`. Fees/thresholds apply from the next cart quote; zones
referenced by past orders are protected by the existing RESTRICT FK —
deactivate, never delete.

## Settings (admin only)

### `GET /api/admin/settings`

```json
{ "settings": { "openMinutes": 660, "closeMinutes": 1350,
  "earliestFulfillmentMinutes": 690, "deliveryEstimateMinutes": 60,
  "pickupEstimateOptionsMinutes": [15, 25],
  "catalogProtectedSince": null, "zonesProtectedSince": null,
  "updatedAt": "..." } }
```

### `PUT /api/admin/settings`

Full replacement of the five editable fields (the `*ProtectedSince` flags
are system-written only — see the seed guard in `05-data-model.md`). Zod +
CHECK rules from `05-data-model.md`. → `200 {"settings":{...}}`. Applies to
the very next checkout request — no cache.

## New: `GET /api/schedule` (public)

The live schedule/estimate values the checkout UI (and future channels —
"când sunteți deschiși?") renders and validates against client-side. The
server remains authoritative; this is display/UX data.

```json
{ "schedule": { "openMinutes": 660, "closeMinutes": 1350,
  "earliestFulfillmentMinutes": 690, "deliveryEstimateMinutes": 60,
  "pickupEstimateOptionsMinutes": [15, 25] } }
```

No auth, no ownership flags, no cache headers (values must be live).

## Changed: `GET /api/menu` (public, additive)

- Each product gains `"ingredients": string|null`, `"allergens": string|null`.
- Inactive variants are OMITTED (new `product_variants.active` flag); a
  product with no active variants is omitted entirely, same as `active=false`.
- Existing consumers keep working — no field changes shape or disappears.

## Changed: `POST /api/orders` (one boundary rule moves)

The schedule/estimate values quote/place validate against now come from
`restaurant_settings` instead of constants; existing codes (`shop_closed`,
etc.) are unchanged. ONE rule moves layers: `pickupEstimateMinutes` was
zod-validated against the constant `[15, 25]` (a static union in
`src/lib/order-schemas.ts`); it becomes a plain positive-integer shape check
in zod, and membership in the CURRENT
`settings.pickupEstimateOptionsMinutes` is checked in the service →
`422 {"error":"invalid_pickup_estimate"}`. Semantic rules live in services —
this restores the file's own stated rule.

## Logging (observability bar, ARCHITECTURE.md)

One structured line per admin request and per service call:
`admin.<area>.<action> actor=<staffUserId> entity=<id> outcome=<ok|code>
durationMs=<n>` — enough to answer "who changed what, when" together with
the status-event journal. Login failures log the username, NEVER the password.
