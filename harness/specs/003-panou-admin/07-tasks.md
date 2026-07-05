# Tasks: Panou admin — produse și comenzi

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

- [ ] T01 — Schema migration 0004: `staff_role` enum + `staff_users` +
      `staff_sessions`, `order_status_events`, `restaurant_settings`
      single row seeded from today's constants (CHECKs per 05-data-model),
      `products.ingredients/allergens`, `product_variants.active`,
      `ALTER TYPE order_status ADD VALUE 'ready_for_pickup'`; verify the
      enum extension applies cleanly on the feat-006-shaped dev DB
      (source: 05-data-model; 03-research D4–D8).
- [ ] T02 — Auth core: `repositories/staff.ts` (users, sessions:
      create/lookup-by-token-hash/rolling-renew/delete/sweep),
      `services/auth.ts` (scrypt hash+verify constant-time, login/logout,
      `verifySession`, `requireStaff`/`requireAdmin`, per-IP+username rate
      limit), `scripts/create-staff-user.ts`; integration tests: good/bad/
      deactivated login, expiry + rolling renewal, role guard
      (source: 03-research D1, 05-data-model StaffUser/StaffSession).
- [ ] T03 — Auth HTTP boundary: `/api/admin/auth/{login,logout,me}` routes,
      `src/proxy.ts` optimistic redirect for `/admin/:path*`,
      `/admin/login` page + admin layout shell (nav, user, logout);
      tests: 401 without cookie on a protected route, login sets cookie,
      me/logout round-trip; manual login at 375px + desktop
      (source: 06-contracts Auth, 03-research D2).
- [ ] T04 — Order-status graph: pure `src/lib/order-status.ts` (per-mode
      transitions, cancel-from-non-final, reason rule, undo derivation,
      Romanian labels at the edge) + `tests/order-status.test.ts` unit
      tests covering both modes, all finals, undo-after-cancel
      (source: 03-research D5, 05-data-model Lifecycle).
- [ ] T05 — Admin orders service + API: `repositories/orders.ts` day list
      (restaurant-local date), totals aggregate, detail with items/options/
      events, transactional transition (+estimate at accept) and undo;
      `services/admin-orders.ts`; routes `GET /orders`, `GET /orders/:id`,
      `POST /orders/:id/transition`, `POST /orders/:id/undo`; integration
      tests: both happy paths end-to-end, every 422 code, estimate rules,
      totals math excl. canceled, staff attribution on events
      (source: 06-contracts Orders, spec FR2–FR4, FR11).
- [ ] T06 — Settings to DB: `repositories/settings.ts` + `services/settings.ts`,
      `GET/PUT /api/admin/settings` (admin only), `restaurant-config.ts`
      slims to types/defaults/timezone/address, `schedule.ts` takes config
      as a parameter, pricing + orders services read the settings row;
      tests: schedule edit applies to the next quote/order, staff gets 403,
      existing orders/schedule suites stay green
      (source: 03-research D6, spec FR9, 06-contracts Settings).
- [ ] T07 — Catalog + zones admin: `repositories/catalog-admin.ts` +
      `services/admin-catalog.ts` (availability toggles staff-permitted;
      prices/texts/ingredients/allergens, product+category creation with
      server-side slugs, topping price upserts, zone create/patch — admin),
      ownership flag set on first write; seed guard in `scripts/seed.ts`
      (`SEED_FORCE=1` override); menu payload gains ingredients/allergens
      and hides inactive variants; all catalog routes; integration tests:
      role matrix both directions, price edit → next quote changes & old
      order untouched, new product orderable end-to-end, deactivated
      variant vanishes from menu + rejected in cart, zone edit affects next
      quote, seed refuses after admin write then obeys SEED_FORCE
      (source: 06-contracts Catalog/Zones, spec FR5–FR8, FR10; 03-research D7/D8).
- [ ] T08 — Admin orders UI: `/admin` day view — 5s polling, new-order
      highlight + repeating Web Audio tone with visible sound state, status
      filters, day browser, totals bar; detail panel with valid-action
      buttons from the graph, accept-with-estimate input, cancel dialog
      (mandatory reason), undo; PC-first layout usable at 375px
      (source: spec FR2–FR4, NFR; 03-research D3).
- [ ] T09 — Admin catalog/zones/settings UI: `/admin/produse` (toggles for
      staff, price cells + texts + ingredients/allergens + new product/
      category forms for admin), `/admin/zone`, `/admin/setari`; role-aware
      rendering (staff never sees admin-only controls); options sheet in
      the shop shows ingredients/allergens
      (source: spec in-scope, Q7/Q14; 06-contracts Catalog).
- [ ] T10 — Write `08-quickstart.md` and execute it: place order → hear/see
      alert → accept with adjusted estimate → walk both mode flows to
      completed; cancel with reason + undo; staff vs admin permission walk;
      price/availability edit reflected in shop; zone + schedule edit; seed
      guard demo; evidence + Definition of Done layers 1–3 recorded in
      `harness/feature-list.json` (source: spec acceptance criteria).
