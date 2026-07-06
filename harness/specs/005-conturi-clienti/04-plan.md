# Plan: Conturi clienți și login social

> Authored by: Agent (the human reviews and approves before implementation).
> Reads from: `01-spec.md`, `02-clarify.md`, `03-research.md`, `harness/docs/ARCHITECTURE.md`.
> Feeds into: `05-data-model.md`, `06-contracts/`, `07-tasks.md`.
> The human decides architecture; the agent implements it.
> 03-research D1–D8 approved by the owner 2026-07-06, INCLUDING the two
> flagged defaults (phone optional at signup; first logged-in order fills an
> empty profile) — recorded as D-g/D-h in `02-clarify.md`.

## Implementation Summary

Add customer accounts as a parallel of staff auth: a `customers` table
(email unique lowercase, nullable scrypt `password_hash`, nullable
`google_sub`), a `customer_sessions` table (opaque token, SHA-256 in DB,
30-day rolling, cookie `rf_client_session`), and a hand-rolled Google OIDC
code flow (+PKCE, zero new dependencies). The method-agnostic crypto/cookie
primitives are EXTRACTED from staff auth into `src/server/auth/` and shared —
staff behavior unchanged, proven by `tests/admin`. Orders gain a nullable
`customer_id`: stamped at insert for logged-in checkouts, backfilled
(first-claim) from guest orders matching normalized phone / lowercase email
at signup and on profile contact changes. New surface: `/cont` (login/signup,
profile, own-orders list with live status) + `/api/account/*`; checkout
prefills silently for logged-in customers and stays byte-identical for
guests. Verification: `npm test -- tests/accounts` with an injectable Google
token exchange; the real Google round-trip and the 375px journey run in
`08-quickstart.md`.

## File Targets

Files this feature is expected to create or modify. Touching files outside
this list is a signal to stop and re-check scope.

Config:
- `.env.example` — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `APP_BASE_URL` (modify)

Schema & data:
- `src/server/db/schema.ts` — `customers`, `customer_sessions`,
  `orders.customer_id` (modify)
- `src/server/db/migrations/0006_feat010_customer_accounts.sql` — generated
  (new)

Pure logic (`src/lib`):
- `src/lib/account-schemas.ts` — `CUSTOMER_SESSION_COOKIE_NAME`, zod for
  register / login / profile patch (reuses `phoneSchema` from
  `order-schemas.ts`), shared account view types (new)

Auth module (`src/server/auth/` — research D1/D3; sits beside repositories,
imports `src/lib` + `node:crypto` only, like `src/server/llm`):
- `src/server/auth/primitives.ts` — scrypt hash/verify, token
  generate/hash, session-cookie build/parse/clear parameterized by cookie
  name — MOVED from `services/auth.ts`, logic byte-identical (new)
- `src/server/auth/google.ts` — pinned OIDC endpoints, `isGoogleConfigured`,
  `buildAuthUrl` (state + PKCE S256), `exchangeCode` (code→tokens, id_token
  claim checks: iss/aud/exp/email_verified), `GoogleClaims` type (new)

Server (repositories → services):
- `src/server/repositories/customers.ts` — customers + customer_sessions
  SQL: find by email / googleSub / id, create, update profile, link
  googleSub, session create/find/renew/delete/sweep (new)
- `src/server/repositories/orders.ts` — `customerId` on
  `NewOrder`/`insertOrder`; `claimGuestOrders(customerId, phone?, email?)`
  (first-claim UPDATE, returns count); `listOrdersForCustomer`;
  `getOrderForCustomer(orderId, customerId)` detail (modify)
- `src/server/services/auth.ts` — staff auth now imports the shared
  primitives; exports unchanged (re-exports keep
  `scripts/create-staff-user.ts` and tests importing `hashPassword` intact)
  (modify)
- `src/server/services/customer-auth.ts` — register (auto-login, terms
  timestamp, linking trigger), login (rate limit ip|email, dummy-hash
  timing, generic errors), logout, `verifyCustomerSession` (30d rolling,
  60s throttle), `requireCustomer(request)`, `loginWithGoogle(claims,
  exchange-injectable at the callback path)` with sub→email→create
  resolution (new)
- `src/server/services/customer-account.ts` — profile view/patch (re-runs
  linking when phone is set/changed), `absorbOrderIntoEmptyProfile`
  (D-h), customer order list/detail views (status labels stay client-side)
  (new)
- `src/server/services/orders.ts` — `PlaceOrderContext.customerId?`
  (additive), stamped into the order row (modify)

HTTP boundary (`src/app/api/account/`):
- `register/route.ts` — POST (new)
- `login/route.ts` — POST (new)
- `logout/route.ts` — POST (new)
- `me/route.ts` — GET (new)
- `profile/route.ts` — PATCH (new)
- `orders/route.ts` — GET list (new)
- `orders/[id]/route.ts` — GET detail (new)
- `google/start/route.ts` — GET redirect to Google (new)
- `google/callback/route.ts` — GET, state/PKCE check → exchange → session
  cookie → redirect `/cont` (new)
- `src/app/api/orders/route.ts` — resolve `rf_client_session` → pass
  `customerId` in context; on success call `absorbOrderIntoEmptyProfile`
  (modify)

UI:
- `src/app/cont/page.tsx` — server component gate: logged out → AuthPanel;
  logged in → profile + orders (new)
- `src/app/cont/comenzi/[id]/page.tsx` — server component, own-order detail
  or `notFound()` (new)
- `src/components/account/AuthPanel.tsx` — login/signup tabs, Google button
  only when `googleEnabled` prop is true (new)
- `src/components/account/ProfileForm.tsx` — profile edit (new)
- `src/components/account/OrdersList.tsx` — own orders, 15s status polling
  (new)
- `src/app/page.tsx` — static "Cont" link in the shop header (no session
  read — the page stays statically rendered) (modify)
- `src/app/comanda/page.tsx` — on mount `GET /api/account/me`; 401 → nothing
  (guest path untouched); 200 → seed ONLY still-pristine fields (modify)
- `src/app/confidentialitate/page.tsx` — account-data section (D-d + Q5
  linking disclosure) (modify)

Ops:
- `scripts/set-customer-password.ts` — operator CLI for the phone-call
  password recovery (Q4), stdin/env password like `create-staff-user.ts`
  (new)

Tests:
- `tests/accounts.test.ts` — integration suite (new)

## Technical Design

- **Shared primitives (D3):** `primitives.ts` exports `hashPassword`,
  `verifyPassword` (scrypt N=2^17/r=8/p=1, format
  `scrypt:N:r:p:salt:hash`), `generateSessionToken` (32B base64url),
  `hashToken` (SHA-256 base64url), `buildSessionCookie(name, token,
  expiresAt)` / `clearedSessionCookie(name)` / `tokenFromRequest(request,
  name)` (Path=/; HttpOnly; SameSite=Lax; Secure in production). Staff
  auth keeps its public surface; only its internals now delegate.
- **Customer sessions:** mirror of staff verify/renew/sweep with
  `TTL = 30d` and the same 60s renewal throttle; logout deletes the row;
  every login issues a fresh token (no fixation). Separate cookie
  `rf_client_session` — a device can hold a staff AND a customer session
  independently.
- **Google flow (D1):** `start` — refuses 503 when unconfigured; else sets
  transient cookie `rf_google_oauth` (httpOnly, Lax, Max-Age 600; holds
  `state` + PKCE verifier) and 302s to the pinned auth endpoint with
  `scope=openid email profile`, `prompt=select_account`. `callback` —
  validates `state` against the cookie, exchanges the code (client secret +
  PKCE verifier, `redirect_uri` = `APP_BASE_URL` +
  `/api/account/google/callback`), validates claims, refuses
  `email_verified !== true`, resolves the account (by `google_sub` → by
  email, linking `google_sub` — D-e → create new), creates a session, clears
  the transient cookie, 302s to `/cont` (no `next` param in v1 — no open
  redirect surface). Failures 302 to `/cont?eroare=google` — the page shows
  one friendly message. Account email is IMMUTABLE in v1 (it is the login
  identifier; changing it safely needs the deferred email verification), so
  a changed Google-side email never rewrites ours (sub match wins).
- **Terms (D-c):** register schema requires `termsAccepted: literal(true)`;
  the Google path shows the same consent line under the button ("prin
  continuare accepți…"), and `terms_accepted_at` is set at account creation.
- **Linking (D4):** `claimGuestOrders` = one UPDATE:
  `SET customer_id = $me WHERE customer_id IS NULL AND (phone = $phone OR
  lower(email) = $email)` (either key may be absent). Triggers: register
  (email always, phone if given), `loginWithGoogle` when it CREATES the
  account (email), profile patch when phone is set/changed. Claimed rows
  are never re-claimed. Count returned and logged
  (`claimed=<n> customer=<id>`).
- **Checkout integration:** `/api/orders` resolves the customer session
  BEFORE `placeOrder` and passes `customerId` in the existing context —
  invalid/absent cookie degrades silently to guest (FR3). After a
  successful placement, `absorbOrderIntoEmptyProfile` copies the order's
  contact+address into the profile ONLY when profile contact fields are all
  empty (D-h), which itself triggers phone linking. Per-order edits never
  overwrite a filled profile (Q2).
- **Own-orders read path (D5):** repository queries filter by
  `customer_id` from the verified session — the id NEVER comes from client
  input. List = newest first, LIMIT 20 (constant; pagination is a recorded
  future step, not built). Detail joins items+options; a non-owned or
  unknown id answers 404 (existence not leaked). `OrdersList` polls
  `GET /api/account/orders` every 15s while mounted (admin pattern,
  relaxed); the detail page is a server-rendered snapshot.
- **Zone in profile:** stored as `zone_id` FK (SET NULL), exposed and
  accepted as `zoneSlug` at the API boundary (checkout's vocabulary);
  unknown slug → 422 `unknown_zone`.
- **Errors/status codes:** follow the house pattern — 400 zod
  `{"error":"validation","issues":[…]}`, 401/403 auth, 422 semantic
  (`email_taken`, `unknown_zone`…), 429 `too_many_attempts` (login,
  identical to staff), 503 `google_not_configured`.
- **Gating (D8):** `/cont` passes `googleEnabled` (server env check) into
  `AuthPanel` — no env value reaches the client, only the boolean; absent
  vars mean the button does not exist and `google/start` answers 503.
- **Observability:** one structured line per auth action (register, login
  ok/fail/rate-limited, google ok/refused, logout, claim count, profile
  absorb) — ids and counts, never passwords/tokens/emails in full
  (log customer id, not address).
- **Testing (D7):** `tests/accounts.test.ts` mirrors the admin harness
  (migrate+seed in `beforeAll`, direct service + route calls, cleanup,
  `resetLoginRateLimiter`-style hook for the customer limiter). Google is
  covered by injecting a scripted `exchangeCode` into the service path
  (`loginWithGoogle(claims)` is plain logic; the callback route stays
  thin). The REAL consent-screen round-trip + the full 375px journey are
  quickstart flows (needs the owner's Google Cloud OAuth client; quickstart
  documents the console steps and the redirect URI).

## Design Constraints

Out of scope (verbatim from 01-spec.md): email tranzacțional (verificare /
reset parolă prin email), Facebook/TikTok login, verificare SMS și legarea
verificată, precompletare în chat/canale externe (feat-009), agendă de
adrese multiple, loialitate/cupoane (feat-011), plată online (feat-012),
modificarea/anularea comenzilor din cont, self-service GDPR UI.

ARCHITECTURE.md constraints touched: zod at every boundary; business logic
in services (routes validate → call → shape); `src/components` never
imports `@/server` (account components fetch `/api/account/*`);
`src/server/auth` imports `src/lib` only (llm-module precedent); secrets
only in `.env`; no client-trusted identity (session cookie is the only
source of `customerId`).

NOT touched: `src/proxy.ts` (no optimistic redirect needed — `/cont`
renders the login panel inline for anonymous visitors), staff tables/flows
(only the internal delegation to primitives), the assistant (accounts and
chat stay unaware of each other in v1), T&C page (privacy page only, per
spec).

## Risks

- **Staff-auth refactor regression:** primitives extraction touches
  feat-007 code. Gate: logic moves verbatim, public exports preserved,
  `npm test -- tests/admin` (46) green before and after the move commit.
- **Guest checkout regression:** `/comanda` + `/api/orders` are modified.
  Gate: `tests/orders` (22) untouched and green; prefill code path is
  strictly additive (401 → today's behavior); quickstart re-runs the guest
  flow.
- **Q5 exposure (accepted):** unverified linking can show one customer's
  history to another who controls/claims the same phone/email. Mitigations
  in v1: normalized-phone primary key for matching, first-claim stamping,
  privacy-page disclosure. Verification (SMS/email) is the recorded
  follow-up feature.
- **Google console dependency:** the live flow needs the owner's OAuth
  client (localhost + production redirect URIs). Everything else ships and
  tests without it; the degradation path (no button, 503) is itself under
  test.
- **Migration on live data:** additive nullable column + new tables — no
  rewrite of existing rows; `drizzle-kit migrate` is already idempotent in
  `init.sh`.
- **In-memory rate limiter:** same single-instance limitation as staff
  (research 003 D1) — acceptable, documented.

## Validation Checklist

Confirm before generating `07-tasks.md`:

- [x] Every acceptance criterion in `01-spec.md` has a verification command
      (`npm test -- tests/accounts`, `tests/orders` for the guest
      regression, quickstart flows for Google + 375px journey).
- [x] Every file target is named above.
- [x] Every entity this feature touches is defined in `05-data-model.md`.
- [x] Every endpoint this feature exposes is defined in `06-contracts/api.md`.
- [x] Nothing contradicts `AGENTS.md`, `harness/docs/ARCHITECTURE.md`, or
      the spec's out-of-scope list.
- [x] Every `02-clarify.md` question is answered; defaults D-a…D-h are
      recorded and owner-approved (2026-07-06) — no open coin flips.
