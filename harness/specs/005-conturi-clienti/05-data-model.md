# Data Model: Conturi clienți și login social

> Authored by: Agent (human approves; contracts and code must match this file).
> Reads from: `01-spec.md`, `02-clarify.md`, `04-plan.md`.
> Feeds into: `06-contracts/`, `07-tasks.md`, the code.
> Single source of truth for entities, fields, rules, and lifecycle.
> If the code and this file disagree, one of them is a bug.

Extends the existing model (menu: 001, orders: 002, admin: 003, assistant:
004). Two new tables + one new column on `orders`. Staff tables are
untouched. One refinement vs. the research sketch: the profile keeps ONE
phone column (always normalized `+40…` by `phoneSchema` at the boundary) —
a separate raw-input column would store a second spelling of the same fact
with no reader.

## Entity: Customer

One person with an account (02-clarify Q1). Both v1 auth methods guarantee
an email, so email is the account identifier. A row must be reachable by at
least one credential.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | |
| `email` | text | yes | — | UNIQUE; stored lowercase (case-insensitive by construction, same trick as `staff_users.username`); IMMUTABLE in v1 (login identifier; safe change needs deferred email verification) |
| `passwordHash` | text | no | null | scrypt `scrypt:N:r:p:salt:hash` via shared primitives; NULL for Google-only accounts; NEVER plaintext |
| `googleSub` | text | no | null | UNIQUE; Google's stable `sub` claim; set at Google signup or when linking by verified email (D-e) |
| `firstName` | text | no | null | profile/prefill; nullable — Google may omit name claims |
| `lastName` | text | no | null | idem |
| `phone` | text | no | null | normalized `+40…` (`phoneSchema` at every boundary); the PRIMARY guest-order linking key (Q3/Q5); optional at signup (D-g); NOT unique — households share numbers |
| `addressStreet` | text | no | null | one delivery profile (D-b) |
| `zoneId` | integer FK → delivery_zones | no | null | ON DELETE SET NULL — profile degrades, never blocks zone admin |
| `termsAcceptedAt` | timestamptz | yes | — | set at account creation (D-c); Google path consents via the button's notice line |
| `createdAt` | timestamptz | yes | now() | |

Constraints:
- CHECK `customers_has_credential`: `password_hash IS NOT NULL OR
  google_sub IS NOT NULL` — no orphan accounts.

Lifecycle: created by register or first Google login → profile edited by
the customer (name/phone/address/zone only) → deleted only by operator on
GDPR request (D-d; no self-service UI). Deletion CASCADEs sessions and
SET-NULLs `orders.customer_id` (order rows are restaurant records and
stay).

Rules:
- Google resolution order at login: by `googleSub` → by `email` with
  `email_verified === true` (sets `googleSub` on the existing row) →
  create. An unverified Google email is refused, never linked or created.
- `phone` set/changed (register, profile patch, D-h absorb) triggers
  `claimGuestOrders`; email triggers it only at account creation (email is
  immutable afterwards).

## Entity: CustomerSession

One logged-in device (mirror of `staff_sessions`, 003 research D1 — opaque
token only in the httpOnly cookie `rf_client_session`; DB stores SHA-256).

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | |
| `tokenHash` | text | yes | — | UNIQUE; SHA-256 (base64url) of the 32-byte token |
| `customerId` | integer FK → customers | yes | — | ON DELETE CASCADE |
| `expiresAt` | timestamptz | yes | — | rolling: now + **30 days** on authenticated use (D-a; staff uses 7) |
| `createdAt` | timestamptz | yes | now() | |
| `lastUsedAt` | timestamptz | yes | now() | renewal throttle: skip the write when touched < 60s ago |

Lifecycle: created at register (auto-login), login, Google callback — one
fresh token per login, never reused. Deleted by logout, by verification of
an expired/inactive row, and by the opportunistic expired-session sweep at
login (same shape as staff).

## Changed Entity: Order (+1 column)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `customerId` | integer FK → customers | no | null | ON DELETE SET NULL. NULL = guest order (or account erased). Set EITHER at insert (logged-in checkout — session-derived, never client input) OR once by `claimGuestOrders` backfill; a non-NULL value is never rewritten (first-claim, D4/Q5) |

Existing columns already carry the linking keys: `orders.phone` is stored
normalized (`+40…`) since feat-006; `orders.email` matches lowercased.

Indexes (new, in migration 0006):
- `orders_customer_idx` ON `orders(customer_id)` — the "my orders" read.
- `orders_claim_phone_idx` ON `orders(phone) WHERE customer_id IS NULL` —
  the backfill probe.
- `orders_claim_email_idx` ON `orders(lower(email)) WHERE customer_id IS
  NULL` — idem for email.

## Not stored (by design)

- No raw/unnormalized phone, no second address, no address book (D-b).
- No marketing consent flag — there is no marketing (D-c).
- No email-verification or phone-verification state — deferred features
  (Q4/Q5); adding their columns now would imply a mechanism that does not
  exist.
- No Google tokens (access/refresh) — Google is used once per login to
  authenticate; nothing calls Google afterwards.
- No customer identity on assistant conversations — out of scope (spec),
  chat stays guest-shaped in v1.
- No roles/permissions on customers — a customer is exactly one kind of
  actor; power stays identical to guest (FR9).
