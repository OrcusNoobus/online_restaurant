# Tasks: Conturi clienți și login social

> Authored by: Agent (generated from the plan; human reviews order and size).
> Reads from: `04-plan.md`, `05-data-model.md`, `06-contracts/`.
> Feeds into: the working sessions; completion rolls up to `harness/feature-list.json`.
> The feature's execution checklist. The feature list tracks WHAT is done
> project-wide; this file tracks the steps WITHIN the active feature.

## Traceability Rule

Every task exists because of something in the spec, plan, data model, or
contract. If a task has no upstream source, it is scope creep — delete it or
take it back to the spec first.

## Sizing Rule

One task ≈ one focused session step ≈ one commit. If a task says only
"implement feature", it is too large. If completing it takes seconds, merge it.

## Task List (ordered by dependency)

- [x] T01 — Shared auth primitives: `src/server/auth/primitives.ts`
      (scrypt hash/verify, `generateSessionToken`, `hashToken`,
      `buildSessionCookie`/`clearedSessionCookie`/`tokenFromRequest`
      parameterized by cookie name) moved VERBATIM from
      `services/auth.ts`; staff auth delegates, public exports unchanged.
      Gate: `npm test -- tests/admin` (46) green, boundary checks pass
      (source: 03-research D3; 04-plan).
- [x] T02 — Schema migration 0006 + customers repository: `customers` +
      `customer_sessions` tables (+ `customers_has_credential` CHECK),
      `orders.customer_id` FK SET NULL + the 3 indexes, per 05-data-model;
      `drizzle-kit generate`; `repositories/customers.ts` (find by
      email/googleSub/id, create, update profile, link googleSub, session
      create/find/renew/delete/sweep). First `tests/accounts.test.ts`
      cases: customer round-trip, lowercase-unique email, credential
      CHECK, session round-trip (source: 05-data-model).
- [x] T03 — Orders repository extensions: `NewOrder.customerId` stamped in
      `insertOrder`; `claimGuestOrders(customerId, {phone?, emailLower?})`
      first-claim UPDATE returning count; `listOrdersForCustomer` (LIMIT
      20, newest first, itemCount); `getOrderForCustomer(orderId,
      customerId)` detail with items+options. Tests: stamp at insert,
      claim by phone / by email / either-key-absent, first-claim never
      re-assigns, list/detail return ONLY the owner's rows
      (source: 03-research D4/D5; 05-data-model; 06-contracts).
- [x] T04 — Account boundary schemas + customer-auth service:
      `src/lib/account-schemas.ts` (`CUSTOMER_SESSION_COOKIE_NAME`,
      register/login/profile-patch zod, `CustomerView` type);
      `services/customer-auth.ts` — register (auto-login, terms timestamp,
      claim trigger), login (rate limit ip|email, dummy-hash timing,
      generic `invalid_credentials`), logout, `verifyCustomerSession`
      (30d rolling, 60s throttle), `requireCustomer(request)`. Tests:
      scrypt-only storage, duplicate email 422 case-insensitive,
      login/logout/invalidation, renewal, 429 after 10 failures, guard
      both outcomes (source: 03-research D2/D3; 06-contracts).
- [x] T05 — Google module + `loginWithGoogle`: `src/server/auth/google.ts`
      (pinned endpoints, `isGoogleConfigured`, `buildAuthUrl` with
      state+PKCE S256, `exchangeCode` with iss/aud/exp/email_verified
      checks, `GoogleAuthError`); `loginWithGoogle(claims)` resolution
      sub → verified email (links `googleSub`) → create (+terms, +claim
      by email). Tests with scripted claims: creates / logs in / links /
      refuses unverified; `buildAuthUrl` parameter assertions
      (source: 03-research D1; 05-data-model rules; 06-contracts Google).
- [x] T06 — Customer-account service: profile view (`CustomerView`,
      zoneId↔zoneSlug), patch (immutable email, `unknown_zone`, phone
      set/change re-runs `claimGuestOrders`),
      `absorbOrderIntoEmptyProfile` (D-h: only when contact fields ALL
      empty; triggers claim via the new phone), customer order
      list/detail views. Tests: patch + re-link, absorb on empty / never
      on filled, view shapes match the contract
      (source: 03-research D4; 06-contracts profile/orders).
- [x] T07 — HTTP boundary `/api/account/*`: register, login, logout, me,
      profile (PATCH), orders, orders/[id], google/start (503 when
      unconfigured; transient `rf_google_oauth` cookie + 302), google/
      callback (state check → injectable exchange → session → 302 /cont;
      failures → 302 /cont?eroare=google). Route-layer tests: status
      mapping (400/401/422/429/503), Set-Cookie on register/login/logout,
      callback happy + state-mismatch redirects (vi.mock in a separate
      test file if needed — 008 T07 lesson)
      (source: 06-contracts endpoints).
- [ ] T08 — Checkout integration: `PlaceOrderContext.customerId?` stamped
      into the order row; `/api/orders` resolves `rf_client_session`
      before placing and calls `absorbOrderIntoEmptyProfile` on success.
      Tests: logged-in placement stamps + absorbs into an empty profile,
      filled profile untouched, guest placement byte-identical
      (customer_id NULL); `npm test -- tests/orders` still 22/22
      (source: 04-plan checkout integration; spec FR3/FR4).
- [ ] T09 — UI: `/cont` server-gated page (AuthPanel logged out — tabs +
      Google button behind `googleEnabled` prop; profile + OrdersList
      logged in), `/cont/comenzi/[id]` detail (404 for non-owned),
      OrdersList 15s polling, static "Cont" link in the shop header
      (page stays static), `/comanda` silent prefill from
      `GET /api/account/me` seeding only pristine fields,
      `confidentialitate` account section (incl. Q5 linking disclosure).
      Gate: lint + typecheck + build; behavior proven in T10 flows
      (source: 04-plan UI; 06-contracts; spec FR3/FR5).
- [ ] T10 — Ops + quickstart: `scripts/set-customer-password.ts` (Q4 phone
      recovery), `.env.example` (GOOGLE_CLIENT_ID/SECRET, APP_BASE_URL);
      `08-quickstart.md` written AND executed at 375px: email+parolă
      journey (signup → prefilled checkout → order in history with live
      status → logout/login), guest-order linking, guest regression,
      no-Google degradation, REAL Google round-trip (owner's OAuth
      client); `09-debug.md`; evidence in `harness/feature-list.json`
      (source: spec acceptance criteria; 03-research D7/D8).

## Notes

- `npm test -- tests/accounts` is the feature verification command —
  matches `tests/accounts.test.ts` and any `accounts-*.test.ts` route file.
- T01–T08 are backend and fully verifiable offline; T09 needs the browser;
  only T10's final flow needs the owner's Google Cloud OAuth client — every
  other Google behavior is covered by the injectable exchange.
- Staff-auth regression gate applies to EVERY task that touches shared
  code: `tests/admin` green before the commit.
