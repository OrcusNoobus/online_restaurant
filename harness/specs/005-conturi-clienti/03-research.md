# Research: Conturi clienți și login social

> Authored by: Agent (human approves each decision).
> Reads from: `01-spec.md`, `02-clarify.md`.
> Feeds into: `04-plan.md`; durable decisions get promoted to `harness/docs/DECISIONS.md`.
> Records feature-level technical choices and WHY they were made, so no later
> session quietly re-decides them.
> Baseline verified before research: `./init.sh` green 2026-07-06 (156/156).
> D1–D8 implement the owner's answers Q1–Q5 and the recorded defaults D-a…D-f
> from `02-clarify.md`; two soft defaults are flagged for owner review (D2, D4).

## Decision 1: Google login = hand-rolled OIDC authorization-code flow, zero new dependencies

- **Options considered:**
  - A: Auth.js (NextAuth v5) — full auth framework with built-in Google
    provider.
  - B: A small OAuth client library (arctic / openid-client /
    google-auth-library) just for the provider handshake.
  - C: Hand-rolled OIDC authorization-code flow + PKCE with plain `fetch`,
    server-side only — two route handlers (start + callback), one module
    that builds the redirect URL and exchanges the code for tokens.
- **Decision:** C.
- **Reason:** Auth.js (A) brings its OWN session/cookie/JWT model — it would
  fight the pattern this repo already trusts (opaque token + SHA-256 hash in
  DB, feat-007) and add a large dependency to use one provider. A helper lib
  (B) saves ~100 lines of stable, spec-defined code at the cost of a new
  pinned dependency and a reference doc. Google's OIDC endpoints are
  documented, stable for a decade, and the flow is small: build auth URL
  (state + PKCE) → callback exchanges `code` at the token endpoint
  server-to-server → read the `id_token` claims. The in-repo Next 16 guide
  (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`)
  recommends exactly the DB-session model we already have; nothing in it
  requires a framework.
- **Consequences:** new module `src/server/auth/google.ts` (endpoints pinned
  as constants, `buildAuthUrl()`, `exchangeCode()`, claim checks); routes
  `GET /api/auth/google/start` and `GET /api/auth/google/callback` (redirect
  handlers; callback sets the session cookie — Next 16: cookies can only be
  set in Route Handlers / Server Functions). Security mechanics in Notes.
  No new npm dependency; no new reference doc needed.

## Decision 2: One `customers` table; email is the account identifier; Google links by verified email

- **Options considered:** A: separate `customer_credentials` /
  `customer_oauth` tables per method; B: one `customers` row per person with
  nullable `password_hash` and nullable `google_sub`, email required and
  unique (stored lowercase).
- **Decision:** B.
- **Reason:** both v1 methods guarantee an email (form field / Google claim),
  and D-e requires Google login with a matching email to land in the SAME
  account — one row per person makes that a lookup, not a merge. Splitting
  tables (A) buys nothing until there are many providers (Facebook/TikTok
  are deferred; adding a `facebook_sub` column later is a one-line
  migration).
- **Consequences:** `customers` mirrors `staff_users` structurally (id,
  email unique lowercase, `password_hash` nullable — Google-only accounts
  have none, `google_sub` text unique nullable, `first_name`, `last_name`,
  `phone` + `phone_normalized` nullable, `address_street` nullable,
  `zone_id` FK nullable, `terms_accepted_at`, `created_at`) — exact columns
  at 05-data-model. Google flow: match by `google_sub` first, else by
  verified email → set `google_sub` (link), else create. `email_verified`
  must be `true` in the ID token before email-linking (Google is the source
  of truth for address possession — D-e); otherwise the login is refused.
  **Flagged default (owner may override):** the email+password signup form
  collects email + password + name, with phone OPTIONAL (low friction,
  symmetric with Google signup which has no phone); address/zone live on the
  profile and checkout, not on signup. Password rules mirror feat-007
  (min 8 chars); no email verification in v1 (Q4).

## Decision 3: Customer sessions mirror staff sessions — separate table + cookie; shared primitives get extracted, not copy-pasted

- **Options considered:** A: reuse the `staff_sessions` table with a "role";
  B: new `customer_sessions` table + new cookie, copy-pasting the crypto
  from `src/server/services/auth.ts`; C: same as B but the method-agnostic
  primitives (scrypt hash/verify, token generate/hash, cookie
  build/parse/clear parameterized by name+TTL) move to one shared module
  used by BOTH staff and customer auth.
- **Decision:** C. Spec already rules out A (customers are not staff:
  separate table AND cookie, no `/admin` access).
- **Reason:** the primitives are identical by design (NFR: "respectă
  practicile din feat-007") — forking them (B) means the next scrypt cost
  bump or cookie fix must be made twice. Extraction is mechanical; staff
  auth behavior does not change and `npm test -- tests/admin` (46 tests)
  proves it.
- **Consequences:** new `src/server/auth/` module (sits beside
  repositories, imports `src/lib` only — same layering precedent as
  `src/server/llm/`); `src/server/services/auth.ts` (staff) and the new
  `src/server/services/customer-auth.ts` both import it. Staff files appear
  in 04-plan's file-target list explicitly (allowed: it IS this feature's
  work, with a regression gate). Customer session parameters: cookie
  `rf_client_session` (httpOnly, SameSite=Lax, Secure in prod, Path=/),
  TTL **30 days rolling** (D-a), same 60s renewal throttle as staff. Login
  rate limiting reuses the feat-007 in-memory limiter pattern keyed
  `ip|email`. Logout deletes the DB row (server-side invalidation, FR2).
  A fresh token is issued at every login (no session fixation); tokens are
  never stored, only SHA-256 hashes.

## Decision 4: Guest-order linking = stamped `customer_id` backfill, not read-time matching

- **Options considered:** A: read-time matching — "my orders" queries
  orders by the profile's phone/email on every view; B: write-time
  stamping — `orders.customer_id` (new nullable FK) is set once per order:
  at insert for logged-in checkouts, and by a one-shot backfill
  (`UPDATE … SET customer_id WHERE customer_id IS NULL AND (phone_normalized
  matches OR lower(email) matches)`) when an account gains a contact
  identifier.
- **Decision:** B.
- **Reason:** read-time matching (A) keeps the Q5 exposure window open
  FOREVER (a reused phone number leaks the previous owner's future history
  too) and makes "whose order is this" a moving answer. Stamping gives a
  stable owner, an indexed `WHERE customer_id = ?` read path, and a
  first-claim rule: an order already claimed by account X is never
  re-assigned to a later account with the same phone — this narrows, without
  eliminating, the accepted Q5 risk.
- **Consequences:** backfill triggers: (1) account creation — by email
  always, by normalized phone when provided; (2) profile contact change —
  when phone/email is first set or edited, the backfill re-runs (this is how
  Google-signup accounts, which start phoneless, pick up their guest
  history). Matching keys: `orders.phone` (already stored normalized `+40…`
  by `phoneSchema`, `src/lib/order-schemas.ts:26`) exact-match against the
  profile's normalized phone; `lower(orders.email)` exact-match. A
  logged-in checkout stamps `customer_id` at insert (no backfill involved).
  Guest orders placed AFTER account creation with the same phone stay
  unclaimed until the next profile edit — accepted, spec only promises
  linking "la crearea contului". FK is `ON DELETE SET NULL`: erasing an
  account (GDPR request, D-d) reverts its orders to guest-like rows — order
  records themselves are restaurant records and stay. Supporting indexes in
  the migration. **Flagged default (owner may override):** if the profile's
  contact/address fields are EMPTY, the first logged-in order copies its
  customer data into the profile (a Google-signup user gets prefill + phone
  linking without a separate profile chore); a filled profile is never
  overwritten by checkout edits — per-order edits stay per-order (Q2).

## Decision 5: "My orders" read path — session-derived identity, repository-level filter, relaxed polling

- **Decision:** a `requireCustomer(request)` guard (mirror of
  `requireStaff`, `src/server/services/auth.ts:217`) resolves the session
  cookie to a customer id; the orders repository gains a
  `listOrdersForCustomer(customerId, limit)` query (`WHERE customer_id = ?
  ORDER BY created_at DESC`), reading the SAME rows/status enum the staff
  panel writes. The customer id NEVER comes from client input — only from
  the verified session. Status freshness: the account orders page renders
  server-side and re-polls the same way the admin day view does, at a
  relaxed 15s (admin uses 5s) — exact interval at plan.
- **Reason:** spec FR5 (isolation both directions) and Q2 ("aceleași date ca
  panoul de personal, DOAR pentru comenzile care îi aparțin"). One shared
  status source means no second status pipeline to keep in sync; the guard
  pattern is already proven by 46 admin tests.
- **Consequences:** isolation is enforced in exactly one place (guard +
  repository filter) and tested in both directions (A sees own, A cannot
  see B's, anonymous sees nothing). Order history is read-only (D-f): no
  mutation endpoint exists for customers, so there is nothing to forbid.
  Detail view (items/options per order) reuses the existing admin detail
  repository query filtered by owner — final shape at contracts.

## Decision 6: Surface — Romanian customer routes under `/cont`, API under `/api/account`; checkout prefill via one GET

- **Decision:** pages `/cont` (login + signup when anonymous; profile +
  order history when logged in — split into subroutes at plan) follow the
  existing Romanian-route convention (`/cos`, `/comanda`). API routes:
  `POST /api/account/register`, `POST /api/account/login`,
  `POST /api/account/logout`, `GET|PUT /api/account/profile`,
  `GET /api/account/orders`, plus the two Google redirect handlers (D1).
  Zod schemas in `src/lib/account-schemas.ts`; route handlers stay thin;
  logic in `customer-auth.ts` / a small `customer-profile` service —
  exact split at plan. Checkout prefill: `/comanda` is a client component
  ("use client", fetches its quote client-side already) — it calls
  `GET /api/account/profile` on mount (204/401 → guest behavior unchanged)
  and seeds the form fields; every field stays editable per order (Q2).
  `POST /api/orders` reads the session cookie server-side and passes the
  customer id into `placeOrder` via `PlaceOrderContext` (additive optional
  field) — a logged-out or absent cookie means exactly today's behavior.
- **Reason:** FR3 ("un client fără cont nu observă nicio diferență") pins
  the integration shape: additive context, no signature break — consistent
  with DECISIONS.md 2026-07-04 (channel-agnostic ordering core; assistant
  and future channels keep passing no customer id — account/assistant
  integration is explicitly out of scope). Prefill-by-fetch is the smallest
  diff to a page that already composes client-side data hooks.
- **Consequences:** header/menu gains a discreet account entry point (mount
  point at plan; mobile-first 375px). Login/signup UI shows the Google
  button ONLY when the server reports Google as configured (D8). No
  `middleware`/proxy change needed for v1 (`/cont` does a real session
  check in its server component, like `/admin/(panel)/layout.tsx:19` —
  optimistic proxy redirects can be added later if UX asks for it).

## Decision 7: Verification — deterministic tests without Google; the real Google flow lives in quickstart

- **Decision:** `npm test -- tests/accounts` (new `tests/accounts.test.ts`,
  same harness as `admin.test.ts`: self-migrate, self-seed, direct
  service + route calls, cleanup) covers: register/login/logout with hashed
  passwords, session rolling + invalidation, rate limiting, profile CRUD,
  checkout stamping, guest-order backfill (by phone, by email, first-claim
  rule, re-run on profile change), isolation both directions, and guest
  regression alongside the untouched `tests/orders` (22 tests). The Google
  callback's token exchange is isolated behind one injectable function
  (D1's `exchangeCode()`), so tests drive the full callback path —
  new-account creation, `google_sub` match, email-link, `email_verified:
  false` refusal — with a scripted exchange, no network. The REAL Google
  round-trip (consent screen → callback → session) runs manually in
  `08-quickstart.md` with the owner's Google Cloud OAuth client
  (quickstart documents the console setup: authorized redirect URI,
  localhost + production origins).
- **Reason:** same rule that shaped feat-008's D9 — `./init.sh` must stay
  green offline and without secrets (AGENTS.md critical rule 4); a live
  IdP in unit tests is flaky and needs credentials in CI.
- **Consequences:** the injectable exchange is the ONLY test seam; claim
  validation (iss/aud/exp/email_verified) is plain code covered
  deterministically. Acceptance criteria in 01-spec map 1:1 onto named
  tests + two quickstart flows (Google login; full 375px account journey).

## Decision 8: Configuration & gating — Google is optional at runtime, like the assistant key

- **Decision:** `.env.example` gains `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  (server-only, never in the repo — AGENTS.md Safety Rules) and
  `APP_BASE_URL` (e.g. `http://localhost:3000`), from which the redirect
  URI is derived — no hardcoded host. When either Google var is absent:
  the login/signup UI simply does not render the Google button, the
  `/api/auth/google/*` routes answer 503, and email+password + guest
  checkout work fully (FR7). Same key-gating pattern as `ANTHROPIC_API_KEY`
  → ChatFab (feat-008).
- **Reason:** FR7 verbatim; deploys must not couple "accounts exist" to
  "owner finished the Google Cloud console setup".
- **Consequences:** the login page learns about Google availability
  server-side (rendered flag, not an env leak to the client). Quickstart
  gets a "without Google configured" flow proving the degradation.

## Notes

- **Google OIDC mechanics** (kept inside `src/server/auth/google.ts`):
  auth endpoint `https://accounts.google.com/o/oauth2/v2/auth`, token
  endpoint `https://oauth2.googleapis.com/token`, pinned as constants
  (runtime discovery-document fetch adds a failure mode for zero benefit at
  one provider). Scope `openid email profile`; `response_type=code`;
  `prompt=select_account`. CSRF/replay protection: random `state` bound to
  a short-lived (10 min) httpOnly cookie, checked at callback; PKCE S256
  `code_verifier` kept in the same transient cookie; both cleared at
  callback. The `id_token` is accepted WITHOUT local JWKS signature
  verification because it is received directly from Google's token endpoint
  over TLS (OIDC Core §3.1.3.7 sanctions this for the code flow); we still
  validate `iss` (`https://accounts.google.com` or `accounts.google.com`),
  `aud` = our client id, `exp`, and require `email_verified === true`.
  Claims used: `sub` → `google_sub`, `email`, `given_name`/`family_name`
  (name prefill). No refresh tokens requested or stored — Google is used
  purely to authenticate, never called again after login.
- **Callback redirect safety:** any post-login `next` target is restricted
  to same-origin relative paths (no open redirect).
- **Account enumeration accepted (minor):** registration with an existing
  email says so ("email deja folosit") — the standard mitigation requires
  transactional email, which is out of scope (Q4). Login itself stays
  generic ("date de autentificare greșite") and rate-limited, mirroring
  feat-007.
- **Forgotten password without email (Q4):** recovery = Google login (same
  account via D-e) or a phone call; for the phone path the operator runs a
  small host-side CLI (`scripts/set-customer-password.ts`, same stdin/env
  pattern as `scripts/create-staff-user.ts` — password never in argv).
  Costs one file; without it "telefonic" has no mechanism.
- **Migration:** `0006_feat010_customer_accounts.sql` — `customers`,
  `customer_sessions`, `orders.customer_id` FK (ON DELETE SET NULL) +
  linking-support indexes. Naming and runner unchanged
  (`drizzle-kit migrate`).
- **Privacy page** (`/confidentialitate`): new section — account data
  stored, purpose (prefill + order history), no marketing (D-c), retention
  (account lives until deletion is requested), delete/export by phone/email
  request (D-d), guest-order linking behavior stated in plain words
  (transparency for the Q5 risk).
- **Promotion candidates for `harness/docs/DECISIONS.md`** once approved:
  D3 (one shared auth-primitives module for every principal type) and D4
  (write-time stamped ownership for cross-feature identity linking) — both
  outlive this feature (Facebook/TikTok login, SMS verification, feat-012
  payments will all touch them).
