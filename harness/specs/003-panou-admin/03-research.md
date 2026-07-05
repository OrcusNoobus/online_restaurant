# Research: Panou admin — produse și comenzi

> Authored by: Agent (human approves each decision).
> Reads from: `01-spec.md`, `02-clarify.md`.
> Feeds into: `04-plan.md`; durable decisions get promoted to `harness/docs/DECISIONS.md`.
> Records feature-level technical choices and WHY they were made, so no later
> session quietly re-decides them.
> D1–D4 were put to the human as explicit options and approved 2026-07-05;
> D5–D10 follow from those choices and the existing architecture.

## Decision 1: Auth — hand-rolled database sessions, no auth library

- **Options considered:**
  - A: Own code — `staff_users` + `sessions` tables, opaque random token in an
    httpOnly cookie, rolling 7-day expiry; passwords hashed with Node's
    built-in `crypto.scrypt`.
  - B: Auth.js (NextAuth) — credentials provider.
  - C: Stateless signed cookie (jose JWT), no session table.
- **Decision:** A (human-approved 2026-07-05).
- **Reason:** The need is small and exact: username + password, two roles,
  accounts seeded at install (02-clarify Q1/Q2/Q14). Auth.js treats
  credentials as a second-class provider (forces JWT sessions, heavy config)
  and its real value — social login — belongs to feat-010, which serves a
  different population (customers, not staff). Stateless JWT makes remote
  logout/revocation impossible without a blacklist. DB sessions keep
  revocation trivial (delete the row) and add zero dependencies:
  `crypto.scrypt` is OWASP-acceptable and built into Node. This follows the
  session-management model documented in the Next.js 16 authentication guide
  (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`).
- **Consequences:** new tables `staff_users` (username unique, password hash,
  role enum admin|staff, active flag) and `staff_sessions` (opaque token
  hash, user FK, expires_at, rolling renewal on use); a `SESSION_SECRET` is
  NOT needed (opaque tokens, not signed payloads) — only the seeded account
  passwords enter `.env`/install docs, never the repo. Login rate-limited
  minimally (per-IP counter) to keep credential stuffing boring.

## Decision 2: Route protection — optimistic `proxy.ts` + real per-request guards

- **Context:** Next.js 16 renamed middleware to `proxy.ts` and is explicit
  that it is for optimistic checks only, NOT a session/authorization solution
  (docs: 01-getting-started/16-proxy.md, 02-guides/authentication.md).
- **Decision:** `src/proxy.ts` matches `/admin/:path*` and redirects to the
  login page when the session cookie is absent (fast UX, no DB hit). The real
  check happens on every request: admin pages and every `/api/admin/*` route
  handler call the auth service (`verifySession()` → `requireStaff()` /
  `requireAdmin()`); role authorization is enforced there, server-side, per
  the Q14 permission matrix. Services stay actor-agnostic; where attribution
  is needed (status events, D4) the handler passes the authenticated
  `staffUserId` into the service as data.
- **Reason:** exactly the layering ARCHITECTURE.md already mandates — route
  handlers validate (here: authenticate + authorize), call a service, shape
  the response. Future channels (feat-008/009) bring their own authn and call
  the same services.

## Decision 3: Realtime order list — polling every ~5 seconds

- **Options considered:** A: polling; B: Server-Sent Events; C: WebSockets.
- **Decision:** A (human-approved 2026-07-05).
- **Reason:** At one restaurant's volume a 5s poll is indistinguishable from
  push, works through any proxy/network, and adds zero infrastructure. SSE's
  real-world edge cases (reconnects, reverse-proxy buffering, idle timeouts)
  buy ~2–3 seconds we don't need; WebSockets are bidirectional overkill for a
  read-only event feed. Clean upgrade path: the polling endpoint's shape
  (cursor/`sinceId`) is exactly what an SSE stream would push later.
- **Consequences:** `GET /api/admin/orders` supports the day view + status
  filters and a lightweight delta form for the poller. The new-order sound
  runs client-side while the response contains status `new` orders — repeated
  until someone accepts (Q4); tone generated with the Web Audio API (no audio
  asset, no autoplay-file quirks; requires one user interaction after page
  load, which login/navigation already provides).

## Decision 4: Status changes are an event table, not columns

- **Options considered:** A: `order_status_events` history table; B: minimal
  columns on `orders` (`cancel_reason`, `status_before`).
- **Decision:** A (human-approved 2026-07-05).
- **Reason:** One table gives everything the spec asks for with one mechanism:
  mandatory cancel reason (event row carries `reason`), one-step undo (revert
  to the last event's `from_status` — works even for cancel, where the prior
  state is otherwise lost), and "who pressed what, when" — audit the future
  POS integration and any dispute will want. Columns-only cannot reconstruct
  two consecutive mistakes.
- **Shape:** `order_status_events(id, order_id FK, from_status, to_status,
  reason text NULL, staff_user_id FK, undo_of_event_id FK NULL, created_at)`.
  `orders.status` remains the authoritative current state (fast list
  queries); events are the journal. Transition + event insert + estimate
  update happen in one transaction, with a CONDITIONAL status update
  (`WHERE status = <expected>`) so concurrent devices cannot double-apply —
  loser gets `409 stale_state`. Undo events carry `undo_of_event_id` and can
  never themselves be undone (review refinement 2026-07-05 — no redo
  ping-pong).

## Decision 5: `ready_for_pickup` — enum extension + transition graph in `src/lib`

- **Decision:** Postgres `ALTER TYPE order_status ADD VALUE
  'ready_for_pickup'` (drizzle migration; PG 17 supports transactional ADD
  VALUE as long as the same transaction doesn't use it). The allowed
  transition graph lives as pure data + functions in `src/lib/order-status.ts`:
  - delivery: `new → accepted → in_delivery → completed`
  - pickup: `new → accepted → ready_for_pickup → completed`
  - cancel: from any non-final state, reason required (Q15)
  - undo: exactly one step back — to the `from_status` of the order's latest
    event; server-validated like any transition.
- **Reason:** the graph is business logic that the admin UI, the API
  validation and the tests all need — one pure module, unit-testable without
  a DB, same pattern as `src/lib/schedule.ts` (002 D3). English codes in
  DB/code, Romanian labels at the display edge (same rule as everywhere).

## Decision 6: Schedule & estimates move to a single-row typed settings table

- **Options considered:** A: key-value settings table (stringly-typed);
  B: single-row `restaurant_settings` table with real columns.
- **Decision:** B.
- **Reason:** the settings are a small, closed, well-typed set (open/close
  minutes, earliest fulfillment, delivery estimate default, pickup options).
  Real columns give Drizzle types, CHECK constraints and explicit migrations;
  key-value gives flexibility we don't need at the cost of parsing everywhere.
  This executes the promotion path written into `src/lib/restaurant-config.ts`
  at 002 D3 ("values move to the database when feat-007 lets the dispatcher
  adjust them").
- **Consequences:** migration creates the row from today's constants;
  `src/lib/restaurant-config.ts` keeps the TYPES, the timezone (never
  editable) and address/phone (contact info, not schedule — stays in code);
  schedule math in `src/lib/schedule.ts` stays pure (config in → verdict
  out), only the config now arrives from the settings repository. Checkout
  reads settings per request — an admin edit applies to the next request, no
  cache layer. Admin-only PUT (Q10).

## Decision 7: Seed guard — ownership flag flipped by the first admin write

- **Options considered:** A: meta flag set on first admin catalog write, seed
  refuses catalog/zone/settings sections while set; B: seed runs only on an
  empty DB; C: per-row provenance tracking.
- **Decision:** A (human-approved 2026-07-05).
- **Reason:** Q8 — after launch the DB is the source of truth for the menu.
  The flag makes the handover explicit and automatic: dev and tests keep
  their reseed workflow untouched until a real admin edit happens; after
  that, `npm run db:seed` exits loudly ("catalog is admin-owned since <date>;
  seed skipped") instead of silently destroying the owner's work. B kills the
  dev reseed loop; C is merge machinery v1 doesn't need.
- **Consequences (refined at review 2026-07-05 — per-domain, not global):**
  TWO timestamps on the settings row, matching the seed's two sections:
  `catalog_protected_since` (set by the first admin mutation of
  categories/products/variants/toppings) and `zones_protected_since` (set by
  the first admin zone mutation). Schedule/settings edits set NEITHER — the
  seed never writes settings, and an orar tweak must not block a menu
  re-seed. The seed checks each flag before its section. Deliberate override
  for humans only: `SEED_FORCE=1`, documented in the seed script's error
  message, resets the flags too. Integration tests that flip a flag reset it
  in cleanup — verified at plan time (T-level detail).

## Decision 8: Ingredients & allergens — free-text columns, shown in the options sheet

- **Decision:** two nullable text columns on `products`: `ingredients`,
  `allergens`; admin-editable (Q7/Q14); rendered in the product options sheet
  under the description when present. Free text in v1 — the owner writes what
  the law and the kitchen need; a structured allergen taxonomy (checkboxes,
  icons, filtering) is future work if ever requested.
- **Reason:** matches how the owner phrased the need ("să putem scrie
  ingrediente, alergeni") and keeps feat-007's footprint on the public shop
  minimal: one display block, no menu-API contract break (additive fields).

## Decision 9: Admin API surface — REST-ish under `/api/admin/*`, same conventions

- **Decision:** all admin operations are route handlers under
  `/api/admin/*`, zod-validated at the boundary, calling services — the exact
  pattern of the existing public API. Planned surface (final shapes at
  06-contracts):
  - `POST /api/admin/auth/login`, `POST /api/admin/auth/logout`,
    `GET /api/admin/auth/me`
  - `GET /api/admin/orders` (day + status filters + poll cursor, includes the
    day totals per Q11), `GET /api/admin/orders/:id`,
    `POST /api/admin/orders/:id/transition` (to-status | cancel+reason |
    undo, plus optional `estimateMinutes` at acceptance per Q6)
  - products/categories/variants/toppings: create + patch (price, active,
    texts) per the Q14 role matrix
  - `GET/POST/PATCH /api/admin/zones`, `GET/PUT /api/admin/settings`
- **Reason:** one API style across the app; the admin UI is just another
  service consumer (DECISIONS.md channel-agnostic core), and the future POS
  integration (clarify Q12 note) will want exactly these endpoints.

## Decision 10: Day view totals are SQL aggregates, not a reporting layer

- **Decision:** the orders repository computes the day's totals (count + sum
  in bani over non-canceled orders, canceled counted separately — Q11
  default) with a plain aggregate query, returned inside the day-view
  response. No materialization, no reporting module.
- **Reason:** v1 asks for one number per day; anything more is feat-territory
  ("rapoarte" is explicitly out of scope). An aggregate over one day of one
  restaurant's orders is microseconds.

## Non-decisions (explicitly deferred)

- SSE/WebSocket push, printing/POS integration, account-management UI,
  structured allergens, degressive delivery fee, next-day scheduling —
  all recorded in 01-spec.md out-of-scope or clarify Notes as future work.

## New dependencies

**None.** Auth uses Node built-ins (`crypto.scrypt`, `crypto.randomBytes`),
polling uses `fetch`, the alert sound uses the Web Audio API. The v1 admin
panel ships without a single new npm package.
