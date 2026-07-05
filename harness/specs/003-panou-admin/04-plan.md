# Plan: Panou admin — produse și comenzi

> Authored by: Agent (the human reviews and approves before implementation).
> Reads from: `01-spec.md`, `02-clarify.md`, `03-research.md`, `harness/docs/ARCHITECTURE.md`.
> Feeds into: `05-data-model.md`, `06-contracts/`, `07-tasks.md`.
> The human decides architecture; the agent implements it.

## Implementation Summary

Add staff auth (users + DB sessions, scrypt, optimistic `src/proxy.ts` +
per-request guards), extend the schema (status events journal,
`ready_for_pickup`, single-row settings, ingredients/allergens, variant
`active` flag), move schedule config from constants to the DB, build the
admin services and the `/api/admin/*` surface (orders day view + totals,
transitions with cancel-reason/undo/estimate, catalog and zone and settings
mutations with the role matrix and the seed-ownership flag), and ship the
admin UI: login → orders day view with 5s polling and Web Audio alert →
order detail with valid actions → catalog/zones/settings pages. The public
shop gains one small block: ingredients/allergens in the options sheet.

## File Targets

Files this feature is expected to create or modify. Touching files outside
this list is a signal to stop and re-check scope.

Schema & data:
- `src/server/db/schema.ts` — `staff_role` enum, `staff_users`,
  `staff_sessions`, `order_status_events` (incl. `undo_of_event_id`),
  `restaurant_settings` (single row + `catalog_protected_since` +
  `zones_protected_since`), `products.ingredients/allergens`,
  `product_variants.active`, `order_status` + `'ready_for_pickup'` (modify)
- `src/server/db/migrations/0004_*` — generated migration, includes seeding
  the settings row from today's constants (new)
- `scripts/seed.ts` — ownership guard (`SEED_FORCE=1` override) (modify)
- `scripts/create-staff-user.ts` — install-time account creation CLI (new)

Pure logic (`src/lib`):
- `src/lib/order-status.ts` — transition graph per mode, cancel/undo rules (new)
- `src/lib/admin-schemas.ts` — zod schemas for every admin input (new)
- `src/lib/restaurant-config.ts` — slims to timezone, address/phone, setting
  TYPES + install defaults; live values move to DB (modify)
- `src/lib/schedule.ts` — config becomes a parameter (pure math unchanged) (modify)
- `src/lib/order-schemas.ts` — `pickupEstimateMinutes` becomes a plain
  positive-int shape check; the allowed-set rule moves to the order service
  (422 `invalid_pickup_estimate`) because the set is now DB-live (modify)

Server (repositories → services):
- `src/server/repositories/staff.ts` — users + sessions SQL (new)
- `src/server/repositories/settings.ts` — read/update the settings row,
  flip catalog ownership (new)
- `src/server/repositories/catalog-admin.ts` — catalog mutations: create/patch
  category, product (+variants), variant, topping, topping prices (new)
- `src/server/repositories/orders.ts` — day list + totals aggregate, detail
  with items/options/events, transactional transition (status + event +
  optional estimate) (modify)
- `src/server/repositories/zones.ts` — list-all/create/patch (modify)
- `src/server/repositories/menu.ts` — expose ingredients/allergens, hide
  inactive variants (modify)
- `src/server/services/auth.ts` — scrypt hash/verify, login/logout,
  verifySession (rolling 7d), requireStaff/requireAdmin, login rate limit (new)
- `src/server/services/admin-orders.ts` — listDay, getDetail, transition,
  undo (new)
- `src/server/services/admin-catalog.ts` — catalog + zone mutations, sets
  catalog ownership on first write (new)
- `src/server/services/settings.ts` — getSettings (used by pricing/orders
  too), updateSettings (new)
- `src/server/services/pricing.ts`, `src/server/services/orders.ts` — read
  schedule config via the settings service instead of constants (modify)

HTTP boundary:
- `src/proxy.ts` — optimistic redirect to `/admin/login` when the session
  cookie is missing on `/admin/:path*`, with `/admin/login` explicitly
  excluded (otherwise: infinite redirect loop) (new)
- `src/app/api/admin/auth/{login,logout,me}/route.ts` (new)
- `src/app/api/admin/orders/route.ts`, `.../orders/[id]/route.ts`,
  `.../orders/[id]/transition/route.ts`, `.../orders/[id]/undo/route.ts` (new)
- `src/app/api/admin/catalog/route.ts` — full admin read view incl.
  inactive entities (the public menu hides them) (new)
- `src/app/api/admin/categories/route.ts`, `.../categories/[id]/route.ts`,
  `.../products/route.ts`, `.../products/[id]/route.ts`,
  `.../variants/[id]/route.ts`, `.../toppings/[id]/route.ts` (new)
- `src/app/api/admin/zones/route.ts`, `.../zones/[id]/route.ts`,
  `.../settings/route.ts` (new)
- `src/app/api/schedule/route.ts` — public live schedule/estimates for the
  checkout UI (and future channels) (new)
- `src/app/api/menu/route.ts` — additive payload fields (modify)

Admin UI (client pages calling `/api/admin/*`; presentational pieces in
`src/components/admin`). Login lives OUTSIDE the protected shell via a route
group — URLs unchanged:
- `src/app/admin/login/page.tsx` — public login, minimal chrome (new)
- `src/app/admin/(panel)/layout.tsx` — protected shell: session check, nav,
  current user, logout (new)
- `src/app/admin/(panel)/page.tsx` — orders day view: 5s polling, new-order
  highlight + repeating Web Audio tone, status filters, day totals, day
  browser; order detail with valid-action buttons, cancel dialog (reason),
  undo, estimate input at acceptance (new)
- `src/app/admin/(panel)/produse/page.tsx` — catalog: availability toggles
  (staff), price edits, texts + ingredients/allergens, new product/category
  (admin) (new)
- `src/app/admin/(panel)/zone/page.tsx`,
  `src/app/admin/(panel)/setari/page.tsx` — admin-only (new)
- `src/app/comanda/page.tsx` — schedule/estimate display switches from
  constants to the live `GET /api/schedule` values (modify)
- `src/components/admin/*` — order card/list, totals bar, status action
  buttons, cancel dialog, editable price cell, forms (plain props only) (new)
- `src/components/cart/OptionsSheet.tsx` — ingredients/allergens block (modify)

Tests:
- `tests/order-status.test.ts` — pure graph unit tests (new)
- `tests/admin.test.ts` — integration: auth, role matrix, transitions,
  estimate, undo, catalog edits vs quotes/menu, zones, settings, seed guard (new)
- `tests/schedule.test.ts` — adapt to injected config (modify)
- `tests/menu.test.ts` — new payload fields, inactive-variant hiding (modify)
- `tests/orders.test.ts` — stays green; settings now come from the DB row (modify if needed)

## Technical Design

- **Auth (03-research D1/D2):** opaque 32-byte token, SHA-256 of it stored in
  `staff_sessions`; httpOnly `SameSite=Lax` cookie scoped to `/`; rolling
  7-day expiry renewed on use. Passwords: `crypto.scrypt` with per-user salt,
  constant-time compare. `proxy.ts` only checks cookie PRESENCE (no DB in
  proxy); every admin page/handler calls `verifySession()`; role authorization
  via `requireAdmin()` where the Q14 matrix says admin-only. Login attempts
  rate-limited in-memory per IP+username (single-instance VPS — acceptable v1).
- **Order lifecycle (D4/D5):** graph lives in `src/lib/order-status.ts`;
  the service validates transition + reason rules, then one transaction:
  CONDITIONAL `UPDATE orders SET status … WHERE status = <expected from>`
  (+ estimateMinutes when accepting) + INSERT order_status_events — zero
  affected rows → `409 stale_state`, nothing written (two devices, one
  winner; race covered by a test). Undo reverts to the latest event's
  `from_status` via a compensating event carrying `undo_of_event_id`; an
  undo event cannot itself be undone (no redo ping-pong). The journal never
  loses history; snapshots are never touched.
- **Settings (D6/D7):** single typed row read per request by checkout
  services and the admin; `schedule.ts` keeps pure signatures
  `(config, now) → verdict`. The checkout UI reads the same live values via
  public `GET /api/schedule` (display/UX; server stays authoritative), and
  the pickup-estimate membership check moves from the static zod union into
  the order service (`invalid_pickup_estimate`). Seed protection is
  per-domain: first admin CATALOG write sets `catalog_protected_since`,
  first ZONE write sets `zones_protected_since`; `scripts/seed.ts` checks
  each flag before its section and exits loudly (settings edits set neither).
- **Day view (D3/D10):** `GET /api/admin/orders?date&status` returns the full
  day + totals in one query pair; the client repolls every ~5s; the alert
  tone loops while the response contains `status='new'` orders. Dates are
  restaurant-local (Europe/Bucharest) day boundaries.
- **Catalog admin:** the panel READS through `GET /api/admin/catalog`
  (full catalog incl. inactive — the public menu hides them, so it cannot
  drive an editor); mutations in `catalog-admin.ts` repository; slugs
  generated server-side (diacritics stripped, uniqueness suffix). New
  products require ≥ 1 variant; availability toggles are separate,
  staff-permitted fields per the matrix (products/variants/toppings ONLY —
  categories are admin-only, Q14). Public menu/pricing already filter
  `active` — variants gain the same flag and filters.
- **Observability:** every admin route handler and service logs one
  structured line (actor id, entity, action, outcome) per ARCHITECTURE.md.

## Design Constraints

Out of scope (verbatim from 01-spec.md): notificări client, tipărire/POS,
reglaj global al estimării, UI gestiune conturi, rapoarte peste totalul
zilei, cupoane (feat-011), conturi clienți (feat-010), plată online
(feat-012), editarea conținutului comenzilor plasate, tracking, stocuri,
texte legale.

ARCHITECTURE.md constraints touched: business ops ONLY in services; route
handlers validate → call service → shape; zod at every boundary; integer
bani; `src/components` presentational (admin pages own fetching/polling,
components get plain props); no `@/server/db` outside `src/server`.

## Risks

- **Enum extension** (`ADD VALUE 'ready_for_pickup'`): PG17 allows it
  transactionally as long as the same transaction doesn't USE the value —
  the migration only adds; first use happens at runtime. Verified in T01 on
  the dev DB.
- **Audio autoplay policy:** browsers require a user gesture before sound —
  the login/navigation click satisfies it; the orders page also shows a
  visible "sound on/off" state so a blocked context degrades loudly, not
  silently.
- **Role matrix sprawl:** enforcement concentrated in two places only — the
  route-handler guard (`requireAdmin`) and field-level zod schemas per role
  (staff PATCH accepts `{active}` only). Tests assert both directions.
- **Seed guard vs test suite:** integration tests that flip a protection
  flag reset it in cleanup; the suite's own seeding continues to work on the
  dev DB. Asserted by an explicit test (seed refuses the protected section →
  SEED_FORCE succeeds).
- **Concurrent devices:** the PC and a phone will both be logged in (Q3);
  every status write is conditional on the expected current state and the
  poller reconciles within seconds — asserted by a race test firing two
  transitions at once.
- **Login route loop:** `/admin/login` sits inside the proxy matcher's
  namespace — the proxy MUST pass it through, and the route-group layout
  keeps the protected shell (session check, nav) off the login page.
- **Settings-per-request DB read** on quote/place: one indexed single-row
  SELECT — negligible; no cache layer, so admin edits apply immediately
  (spec FR9).
- **Existing tests** (orders/schedule) must stay green through the config
  injection — schedule math unchanged, only the config source moves.

## Validation Checklist

Confirm before generating `07-tasks.md`:

- [x] Every acceptance criterion in `01-spec.md` has a verification command.
- [x] Every file target is named above.
- [x] Every entity this feature touches is defined in `05-data-model.md`.
- [x] Every endpoint/interface this feature exposes is defined in `06-contracts/`.
- [x] Nothing contradicts `AGENTS.md`, `harness/docs/ARCHITECTURE.md`, or the spec's out-of-scope list.
- [x] Every 02-clarify.md question is answered — no open coin flips.
