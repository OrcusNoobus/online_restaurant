# Contract: Conturi clienți — API, cookies, Google flow

> Authored by: Agent (human approves; this file is the authoritative shape).
> Reads from: `01-spec.md`, `05-data-model.md`.
> Feeds into: `07-tasks.md`, the code, `08-quickstart.md`.
> Exact request/response shapes. The code conforms to this file — not the
> other way around. Error responses are part of the contract, not an
> afterthought.

## Common Rules

- Same conventions as the shop API: JSON in/out, prices **integer bani**,
  timestamps ISO-8601 with offset, zod at the boundary. Malformed shape →
  `400 {"error":"validation","issues":[…]}`. Semantic refusals → `422
  {"error":"<code>"}`. Unauthenticated → `401 {"error":"unauthenticated"}`.
  Unexpected → `500 {"error":"internal"}`.
- Identity comes ONLY from the `rf_client_session` cookie (httpOnly,
  SameSite=Lax, Secure in production, Path=/, rolling 30-day expiry). No
  endpoint accepts a customer id in the body/query. A missing/invalid
  cookie on a customer endpoint is `401`; on `POST /api/orders` it silently
  means guest (FR3).
- The **CustomerView** returned by auth/profile endpoints (never the hash,
  never internals):

```json
{
  "id": 7,
  "email": "ana@example.com",
  "firstName": "Ana",
  "lastName": "Pop",
  "phone": "+40712345678",
  "addressStreet": "Str. Principală 10",
  "zoneSlug": "santana-de-mures",
  "hasPassword": true,
  "hasGoogle": false
}
```

  Nullable: `firstName`, `lastName`, `phone`, `addressStreet`, `zoneSlug`.
  `phone` is always the normalized `+40…` form.

## `POST /api/account/register`

```json
{
  "email": "ana@example.com",
  "password": "minim8caractere",
  "firstName": "Ana",
  "lastName": "Pop",
  "phone": "0712345678",
  "termsAccepted": true
}
```

- `email`: trimmed, lowercased, valid email, max 200. `password`: 8–256.
  `firstName`/`lastName`: 1–100 (same caps as checkout). `phone`: OPTIONAL
  (D-g), `phoneSchema` (normalizes to `+40…`). `termsAccepted`:
  `literal(true)` (D-c).
- Side effects: creates the customer, sets `terms_accepted_at`, runs
  `claimGuestOrders` (email + phone when present), creates a session
  (auto-login).

Response `201`: `{ "customer": CustomerView }` + `Set-Cookie:
rf_client_session=…`.

Errors: `422 {"error":"email_taken"}` (case-insensitive; enumeration via
register accepted for v1 — 03-research Notes); `400` validation.

## `POST /api/account/login`

```json
{ "email": "ana@example.com", "password": "…" }
```

Response `200`: `{ "customer": CustomerView }` + `Set-Cookie` (fresh token
every login).

Errors (mirror staff login): `401 {"error":"invalid_credentials"}` —
unknown email, wrong password and Google-only account (no password to
check) are indistinguishable on purpose, all burn one scrypt verification;
`429 {"error":"too_many_attempts"}` — 10 failures / 15 min per IP+email.

## `POST /api/account/logout`

No body. Always `204` + `Set-Cookie` clearing the customer cookie; the
session row is deleted (server-side invalidation, FR2). Idempotent.

## `GET /api/account/me`

`200 { "customer": CustomerView }` | `401`. Used by `/comanda` for silent
prefill: on `401` the checkout does NOTHING (guest path byte-identical);
on `200` it seeds only fields the visitor has not already typed into.

## `PATCH /api/account/profile`

Strict-object patch, at least one key (house pattern from admin):

```json
{
  "firstName": "Ana",
  "lastName": "Pop",
  "phone": "0712345678",
  "addressStreet": "Str. Principală 10",
  "zoneSlug": "santana-de-mures"
}
```

- All keys optional; `phone`, `addressStreet`, `zoneSlug` also accept
  `null` to clear. `email` is NOT patchable (immutable in v1 — data model).
- Setting/changing `phone` re-runs `claimGuestOrders` (D4).

Response `200`: `{ "customer": CustomerView }`.
Errors: `401`; `422 {"error":"unknown_zone"}`; `400` validation / empty
patch.

## `GET /api/account/orders`

Own orders only, newest first, LIMIT 20 (v1 constant; pagination is a
recorded future step).

```json
{
  "orders": [
    {
      "id": 821,
      "orderNumber": "#821",
      "status": "in_delivery",
      "mode": "delivery",
      "createdAt": "2026-07-06T18:22:00+03:00",
      "scheduledFor": null,
      "estimateMinutes": 45,
      "totalBani": 7000,
      "itemCount": 3
    }
  ]
}
```

- `status` uses the existing `orderStatusValues` enum — read from the same
  rows the staff panel writes (Q2). `401` when anonymous. The account page
  polls this endpoint every 15s while mounted.

## `GET /api/account/orders/[id]`

Full own-order detail: the list row fields plus `addressStreet`,
`zoneName`, `notes`, `paymentMethod`, `subtotalBani`, `sgrBani`,
`deliveryFeeBani`, and `items` (productName, variantName, quantity,
unitPriceBani, lineTotalBani, options[] with toppingName + priceBani +
sgrDepositBani — the same snapshot shape the admin detail uses, minus
staff-only fields like `clientIp` and status events).

Errors: `401`; `404 {"error":"not_found"}` for BOTH unknown ids and
other customers' orders — ownership is not leaked. Read-only: no mutation
endpoints exist for customers (D-f).

## Google OAuth (redirect endpoints, not JSON)

### `GET /api/account/google/start`

- Unconfigured (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`APP_BASE_URL`
  missing) → `503 {"error":"google_not_configured"}` (the UI never shows
  the button in this state — D8).
- Otherwise: sets transient cookie `rf_google_oauth` (httpOnly, Lax,
  Max-Age 600 — holds `state` + PKCE verifier), `302` to
  `https://accounts.google.com/o/oauth2/v2/auth` with `response_type=code`,
  `scope=openid email profile`, `prompt=select_account`, `state`,
  `code_challenge`(+`_method=S256`), `redirect_uri =
  APP_BASE_URL + /api/account/google/callback`.

### `GET /api/account/google/callback?code=…&state=…`

- Validates `state` against the transient cookie, exchanges the code at
  `https://oauth2.googleapis.com/token` (client secret + PKCE verifier),
  validates id_token claims: `iss` ∈ {`https://accounts.google.com`,
  `accounts.google.com`}, `aud` = client id, `exp` in the future,
  `email_verified === true`.
- Resolution (data-model rule): `googleSub` match → login; else verified
  email match → link `googleSub` to that account → login; else create the
  account (name claims → profile, `terms_accepted_at` = now — the button
  carries the consent notice) and run `claimGuestOrders` (email).
- Success: session created, `Set-Cookie: rf_client_session=…`, transient
  cookie cleared, `302 /cont`.
- ANY failure (state mismatch, exchange error, invalid claims, unverified
  email, Google `error=` param): transient cookie cleared,
  `302 /cont?eroare=google` — the page shows one friendly message; nothing
  more specific leaks into the URL. No `next` parameter exists in v1 (no
  open-redirect surface).

## Changed: `POST /api/orders`

Request/response/validation UNCHANGED (guest contract, 002). New behavior,
additive only:

- The route resolves `rf_client_session` BEFORE placing; a valid session
  passes `customerId` via `PlaceOrderContext` and the order row is stamped
  at insert. Absent/invalid cookie → `customerId` null → byte-identical to
  today.
- After a successful logged-in placement: if the profile's contact fields
  (firstName, lastName, phone, addressStreet) are ALL empty, the order's
  customer data is copied into the profile (D-h) — which may itself trigger
  guest-order linking via the now-set phone. A non-empty profile is never
  modified by checkout.

## Service-internal contracts (authoritative)

```ts
// src/server/auth/google.ts
interface GoogleClaims {
  sub: string;
  email: string;            // lowercased before use
  emailVerified: boolean;
  givenName: string | null;
  familyName: string | null;
}
// exchangeCode({code, codeVerifier, redirectUri}) → Promise<GoogleClaims>
// — throws GoogleAuthError on HTTP/claim failures. The customer-auth
// service accepts this function as an injectable parameter (default: the
// real one) — the ONLY Google test seam (03-research D7).

// src/server/services/customer-auth.ts
// requireCustomer(request) → {ok:true, customer} |
//   {ok:false, status:401, error:"unauthenticated"}
// — mirror of requireStaff; used by every /api/account/* handler.

// src/server/services/orders.ts (additive)
interface PlaceOrderContext {
  clientIp: string | null;
  now?: Date;
  customerId?: number | null;   // session-derived by the route; never client input
}

// src/server/repositories/orders.ts
// claimGuestOrders(customerId, {phone?, emailLower?}) → Promise<number>
// — UPDATE … SET customer_id WHERE customer_id IS NULL AND (phone = $1
//   OR lower(email) = $2); returns claimed count (logged).
```

## Env contract (.env.example)

```
GOOGLE_CLIENT_ID=        # server-only; both absent → no Google button, google/start → 503
GOOGLE_CLIENT_SECRET=    # server-only; NEVER committed
APP_BASE_URL=http://localhost:3000   # origin used to derive the OAuth redirect URI
```

## Cookie contract (summary)

| Cookie | Purpose | Attributes | Lifetime |
|---|---|---|---|
| `rf_client_session` | customer session token (opaque) | httpOnly; SameSite=Lax; Secure (prod); Path=/ | rolling 30 days |
| `rf_google_oauth` | OAuth `state` + PKCE verifier between start and callback | httpOnly; SameSite=Lax; Secure (prod); Path=/ | Max-Age 600, cleared at callback |
| `rf_admin_session` | staff (feat-007) — UNTOUCHED | — | rolling 7 days |
