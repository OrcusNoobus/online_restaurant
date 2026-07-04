# Plan: Coș și plasare comandă

> Authored by: Agent (the human reviews and approves before implementation).
> Reads from: `01-spec.md`, `02-clarify.md`, `03-research.md`, `harness/docs/ARCHITECTURE.md`.
> Feeds into: `05-data-model.md`, `06-contracts/`, `07-tasks.md`.
> The human decides architecture; the agent implements it.

## Implementation Summary

Extend the menu schema (group required/displayType, topping SGR deposit,
stable variant ids), add `delivery_zones` + the order tables, build two
stateless services — `quoteCart()` and `placeOrder()` — exposed as
`POST /api/cart/quote` and `POST /api/orders`, extend `GET /api/menu` with
topping groups, and ship the mobile-first UI: product options sheet →
client-held cart (localStorage) → checkout (delivery/pickup, scheduling,
guest data, payment method) → confirmation with the order number.

## File Targets

Files this feature is expected to create or modify. Touching files outside
this list is a signal to stop and re-check scope.

- `src/server/db/schema.ts` — extend topping_groups (`required`,
  `display_type`, `sort_order`), toppings (`sgr_deposit_bani`), unique
  `(product_id, name)` on product_variants; new: delivery_zones, orders,
  order_items, order_item_options + enums (modify)
- `src/server/db/migrations/*` — generated migrations (new)
- `scripts/seed.ts` — variant natural-key upsert (03-research D4), group
  fields, SGR transform (D5), zone seed from `data/delivery-zones.json` (modify)
- `data/delivery-zones.json` — owner-reviewed zone values from Q8 (new)
- `src/lib/restaurant-config.ts` — hours, estimates, timezone (new)
- `src/lib/schedule.ts` — pure open/closed + scheduled-time validation (new)
- `src/lib/order-schemas.ts` — zod input schemas shared by quote/place (new)
- `src/server/repositories/menu.ts` — include topping groups per product (modify)
- `src/server/repositories/zones.ts` — active zones query (new)
- `src/server/repositories/orders.ts` — transactional order insert (new)
- `src/server/services/pricing.ts` — `quoteCart()` (new)
- `src/server/services/orders.ts` — `placeOrder()` (new)
- `src/app/api/menu/route.ts` — extended payload (modify)
- `src/app/api/zones/route.ts`, `src/app/api/cart/quote/route.ts`,
  `src/app/api/orders/route.ts` — route handlers: validate → service → shape (new)
- `src/components/menu/ProductCard.tsx` — "Adaugă" opens the options sheet (modify)
- `src/components/cart/*` — OptionsSheet, CartProvider (localStorage),
  cart line components, header cart badge (new)
- `src/app/layout.tsx` — CartProvider + header badge (modify)
- `src/app/cos/page.tsx` — cart page (new)
- `src/app/comanda/page.tsx` — checkout (new)
- `src/app/comanda/confirmare/page.tsx` — confirmation (new)
- `src/app/termeni/page.tsx`, `src/app/confidentialitate/page.tsx` —
  placeholder legal pages (Q14) (new)
- `tests/orders.test.ts` — integration: pricing, zones, placement, validation (new)
- `tests/schedule.test.ts` — unit tests for the pure schedule module (new)
- `tests/menu.test.ts` — adjust for the extended menu contract (modify)

## Technical Design

- **Data layer:** per `05-data-model.md`; all money integer bani with CHECKs;
  order placement is a single transaction (order + items + options).
- **Services:** `quoteCart()` resolves every id against the DB, enforces
  required groups / allowed toppings / active flags, computes
  subtotal / SGR / fee / total, and returns machine-readable reasons for any
  invalid line. `placeOrder()` = quote + customer/schedule/payment validation
  + transactional insert, returning the order id. Route handlers only
  validate (zod), call the service, shape the response, and log
  (ARCHITECTURE.md observability bar). Client IP from `x-forwarded-for`.
- **Schedule math:** pure functions over (now, config) in Europe/Bucharest;
  v1 rules per 02-clarify.md Q16 proposal.
- **UI:** cart state in a client-side provider persisted to localStorage;
  every render of cart/checkout re-quotes via the API so prices always come
  from the server; UI never does money arithmetic.
- **Access control:** public endpoints, guest checkout; no auth in v1.
- **Testing:** integration tests self-migrate/seed like feat-002 (menu seed +
  zone seed); schedule module unit-tested with fixed clocks.

## Design Constraints

Out of scope (verbatim from 01-spec.md): plata online (feat-012), cupoane
(feat-011), conturi (feat-010), admin/dispecer (feat-007), notificări,
comenzi pentru altă zi, texte legale finale, tracking/facturare, editarea
comenzii după plasare.

ARCHITECTURE.md constraints touched: business logic ONLY in services
(channel-agnostic core, DECISIONS.md 2026-07-04); server-side totals from DB
prices; zod at every boundary; integer bani; `src/components` stays
presentational (cart provider passes plain props down).

## Risks

- **Options UI complexity** (radio vs checkbox groups, per-size topping
  prices) — mitigated: render straight from the extended menu payload; the
  server re-validates everything anyway.
- **Schedule edge cases** (order at 22:29, scheduled 11:30 sharp, server in
  UTC) — mitigated: pure module + unit tests with fixed clocks; explicit
  Europe/Bucharest conversion.
- **Seed migration of variants** (D4) on an existing dev DB: natural-key
  upsert must converge without duplicating variants — covered by the seed
  idempotency test extended to run against the feat-002-shaped data.
- **localStorage carts going stale** (prices/products change) — mitigated:
  quote-on-load reconciles and surfaces removed/changed items.

## Validation Checklist

Confirm before generating `07-tasks.md`:

- [x] Every acceptance criterion in `01-spec.md` has a verification command.
- [x] Every file target is named above.
- [x] Every entity this feature touches is defined in `05-data-model.md`.
- [x] Every endpoint/interface this feature exposes is defined in `06-contracts/`.
- [x] Nothing contradicts `AGENTS.md`, `harness/docs/ARCHITECTURE.md`, or the spec's out-of-scope list.
- [ ] Every 02-clarify.md question is answered — no open coin flips.
      (Q15, Q16 open with recorded agent proposals as defaults; both are
      seed-data / validation-rule reversible, not architectural. Owner may
      answer any time before the feature is marked done.)
