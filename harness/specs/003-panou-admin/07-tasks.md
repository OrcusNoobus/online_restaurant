# Tasks: Panou admin — produse și comenzi

> Authored by: Agent (generated from the plan; human reviews order and size).
> Reads from: `04-plan.md`, `05-data-model.md`, `06-contracts/`.
> Feeds into: the working sessions; completion rolls up to `harness/feature-list.json`.
> The feature's execution checklist. The feature list tracks WHAT is done
> project-wide; this file tracks the steps WITHIN the active feature.
> Re-cut 2026-07-05 after the critical review: former T07/T09 split into
> single-theme tasks (one task = one commit).

## Traceability Rule

Every task exists because of something in the spec, plan, data model, or
contract. If a task has no upstream source, it is scope creep — delete it or
take it back to the spec first.

## Sizing Rule

One task ≈ one focused session step ≈ one commit. If a task says only
"implement feature", it is too large. If completing it takes seconds, merge it.

## Task List (ordered by dependency)

- [x] T01 — Schema migration 0004: `staff_role` enum + `staff_users` +
      `staff_sessions`, `order_status_events` (incl. `undo_of_event_id`),
      `restaurant_settings` single row seeded from today's constants with
      `catalog_protected_since` + `zones_protected_since` (CHECKs per
      05-data-model), `products.ingredients/allergens`,
      `product_variants.active`, `ALTER TYPE order_status ADD VALUE
      'ready_for_pickup'`; verify the enum extension applies cleanly on the
      feat-006-shaped dev DB (source: 05-data-model; 03-research D4–D8).
- [ ] T02 — Auth core: `repositories/staff.ts` (users, sessions:
      create/lookup-by-token-hash/rolling-renew/delete/sweep),
      `services/auth.ts` (scrypt hash+verify constant-time, login/logout,
      `verifySession`, `requireStaff`/`requireAdmin`, per-IP+username rate
      limit), `scripts/create-staff-user.ts`; integration tests: good/bad/
      deactivated login, expiry + rolling renewal, role guard
      (source: 03-research D1, 05-data-model StaffUser/StaffSession).
- [ ] T03 — Auth HTTP boundary: `/api/admin/auth/{login,logout,me}` routes;
      `src/proxy.ts` optimistic redirect for `/admin/:path*` with
      `/admin/login` explicitly passed through (no redirect loop); route
      group `(panel)` so the protected shell (nav, user, logout) never wraps
      the public login page; tests: 401 without cookie on a protected route,
      login sets cookie, me/logout round-trip, login page reachable without
      session; manual login at 375px + desktop
      (source: 06-contracts Auth, 03-research D2, review point 3).
- [ ] T04 — Order-status graph: pure `src/lib/order-status.ts` (per-mode
      transitions, cancel-from-non-final, reason rule, undo derivation incl.
      the no-undo-of-undo rule, Romanian labels at the edge) +
      `tests/order-status.test.ts` unit tests covering both modes, all
      finals, undo-after-cancel, undo-of-undo refused
      (source: 03-research D5, 05-data-model Lifecycle).
- [ ] T05 — Admin orders service + API: `repositories/orders.ts` day list
      (restaurant-local date), totals aggregate, detail with items/options/
      events, transactional CONDITIONAL transition (+estimate at accept) and
      undo; `services/admin-orders.ts`; routes `GET /orders`,
      `GET /orders/:id`, `POST /orders/:id/transition`,
      `POST /orders/:id/undo`; integration tests: both happy paths
      end-to-end, every 422 code, `409 stale_state` race (two concurrent
      transitions — one winner), estimate rules, totals math excl. canceled,
      staff attribution on events
      (source: 06-contracts Orders, spec FR2–FR4, FR11; review points 5/6).
- [ ] T06 — Settings to DB: `repositories/settings.ts` + `services/settings.ts`,
      `GET/PUT /api/admin/settings` (admin only) + public
      `GET /api/schedule`; `restaurant-config.ts` slims to types/defaults/
      timezone/address, `schedule.ts` takes config as a parameter, pricing +
      orders services read the settings row; `order-schemas.ts` pickup
      estimate becomes shape-only, membership checked in the service
      (`invalid_pickup_estimate`); checkout UI (`/comanda`) renders live
      values from `GET /api/schedule`; tests: schedule edit applies to the
      next quote/order AND to `GET /api/schedule`, new pickup option
      accepted after edit / removed one rejected, staff gets 403, existing
      orders/schedule suites stay green
      (source: 03-research D6, spec FR9, 06-contracts Settings/schedule;
      review point 4).
- [ ] T07 — Admin catalog read + availability: `GET /api/admin/catalog`
      (full view incl. inactive, per 06-contracts); availability toggle
      endpoints/fields for product/variant/topping (staff-permitted); menu
      payload + pricing hide/reject inactive VARIANTS (new flag) — products/
      toppings already filtered; integration tests: staff toggles each
      level, deactivated variant vanishes from `GET /api/menu` + rejected in
      cart quote, admin catalog still shows it, categories NOT togglable by
      staff (403)
      (source: 06-contracts Catalog, spec FR5; review points 1/2).
- [ ] T08 — Catalog edits (admin): prices (variant `priceBani`, topping
      `prices[]` upsert by size, `sgrDepositBani`), names/descriptions/
      ingredients/allergens; menu payload gains `ingredients`/`allergens`
      (additive contract change); integration tests: role matrix both
      directions (staff → 403 on every edit field), price edit → next quote
      changes & pre-existing order snapshot untouched, texts round-trip to
      the public menu (source: 06-contracts Catalog, spec FR6/FR7 partial).
- [ ] T09 — Create product + category (admin): `POST /api/admin/categories`,
      `POST /api/admin/products` (≥ 1 variant, server-side slugs, topping
      group links); integration tests: new product (new category,
      ingredients, allergens) appears in `GET /api/menu` and is orderable
      end-to-end via quote + place; duplicate name → `name_taken`
      (source: 06-contracts Catalog, spec FR7).
- [ ] T10 — Zones admin: `GET/POST /api/admin/zones`, `PATCH
      /api/admin/zones/:id` (admin only); integration tests: fee/threshold
      edit changes the next quote, new zone selectable at checkout
      (public `GET /api/zones`), deactivated zone disappears from public
      but stays in admin list, staff → 403
      (source: 06-contracts Zones, spec FR8).
- [ ] T11 — Seed guard: catalog mutations set `catalog_protected_since`,
      zone mutations set `zones_protected_since`; `scripts/seed.ts` checks
      each flag before its section and exits loudly; `SEED_FORCE=1`
      override resets flags; integration tests: seed refuses only the
      protected section, the other section still seeds, SEED_FORCE
      restores; test cleanup resets flags
      (source: 03-research D7, spec FR10; review point 8).
- [ ] T12 — Admin orders UI: `/admin` day view — 5s polling, new-order
      highlight + repeating Web Audio tone with visible sound state, status
      filters, day browser, totals bar; detail panel with valid-action
      buttons from the graph, accept-with-estimate input, cancel dialog
      (mandatory reason), undo, stale-state refetch on 409; PC-first layout
      usable at 375px (source: spec FR2–FR4, NFR; 03-research D3).
- [ ] T13 — Admin catalog UI + shop display: `/admin/produse` — tree from
      `GET /api/admin/catalog`, availability toggles (staff view), price
      cells + texts + ingredients/allergens + new product/category forms
      (admin view), role-aware rendering; options sheet in the shop shows
      ingredients/allergens (source: spec in-scope, Q7/Q14; 06-contracts).
- [ ] T14 — Zones + settings UI (admin-only pages): `/admin/zone` (list,
      edit fee/threshold, add, deactivate), `/admin/setari` (schedule +
      estimates form with validation) (source: spec in-scope, Q9/Q10).
- [ ] T15 — Write `08-quickstart.md` and execute it: place order → hear/see
      alert → accept with adjusted estimate → walk both mode flows to
      completed; cancel with reason + undo; two-device race sanity check;
      staff vs admin permission walk; price/availability edit reflected in
      shop; new product ordered; zone + schedule edit live; seed guard
      demo; evidence + Definition of Done layers 1–3 recorded in
      `harness/feature-list.json` (source: spec acceptance criteria).
