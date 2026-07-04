# PROGRESS.md

> Authored by: Agent (updated before every session ends; human may correct).
> This file answers one question for the next session: "Where are we, and what is next?"
> It is a snapshot, not a history — overwrite sections freely. DEV_LOG.md and git log are the history.

## Current State

- **Last updated:** 2026-07-04 (feat-006 session 1 — spec → code → done, same day)
- **Active feature:** none — feat-006 (Coș și plasare comandă) DONE with
  evidence on branch `feat/006-cos-comanda` (not yet merged to main).
- **Verification status:** ./init.sh fully green (47/47 tests, build, boundary
  checks); `npm test -- tests/orders` 22/22; quickstart flows 1–5 executed
  live (orders #13 delivery / #19 pickup in the dev DB).
- **Open items for the owner:**
  1. Merge `feat/006-cos-comanda` → main (12 commits, self-contained).
  2. Supply the exact restaurant address — `RESTAURANT_ADDRESS` in
     `src/lib/restaurant-config.ts` is a placeholder ("Sântana de Mureș").
  3. Supply the real T&C / GDPR texts for `/termeni` + `/confidentialitate`
     (placeholders live, per clarify Q14).
  4. Old local branch `feat/002-meniu-catalog` is fully merged — safe to delete.

## Done

- [x] feat-001 Project setup; feat-002 Meniu produse (see git history)
- [x] feat-006 Coș și plasare comandă — full document chain (01–09) + T01–T10:
  - stable variant ids (natural-key upsert), topping-group flags, SGR as
    sgr_deposit_bani (transform in seed; JSON snapshot untouched)
  - delivery_zones (6 zones, Q8 values) + GET /api/zones
  - pure schedule module (Europe/Bucharest, 11:00–22:30, floor 11:30)
  - quoteCart() + POST /api/cart/quote (fee below threshold, free at/above,
    freeDeliveryGapBani hint) and placeOrder() + POST /api/orders (atomic,
    snapshots, +40 phone, client IP)
  - UI: options sheet, localStorage cart (useSyncExternalStore), /cos,
    /comanda (mode/zone/schedule/payment/T&C), confirmation, legal placeholders

## In Progress

- (nothing mid-flight)

## Next Steps

1. Owner merges feat/006 and answers the open items above.
2. Next feature by dependency order: feat-007 (Panou admin: produse și
   comenzi) — starts at spec time with the owner. Known seeds for its spec:
   dispatcher-adjustable delivery estimate (clarify Q10 note), order status
   flow already defined in the DB enum (new → accepted → in_delivery →
   completed / canceled), zone fee/threshold editing, product/topping
   activate-deactivate (soft hide is already respected by menu + pricing).
3. Alternative next: feat-010/011/012 exist in the list but depend on or are
   smaller than feat-007; feat-007 unlocks going live (orders only in DB).

## Blockers / Risks

- None technical. The shop must NOT go live before feat-007 (nobody sees
  orders otherwise — clarify Q6 decision).

## Decisions Made This Session

- Delivery fee model (owner): per-zone fee applies only BELOW the zone's
  free-delivery threshold; at/above → free; orders are never blocked.
  Threshold base = subtotal + SGR. Future (not v1): degressive fee.
- Ordering window v1 (owner): placement only while open, same-day scheduling
  ≥ max(now + estimate, 11:30). Future: next-day scheduling.
- SGR applies to drink add-ons too (owner, Q15) — seed-data reversible.
- New features recorded per owner: feat-010 accounts + social login,
  feat-011 coupons, feat-012 online card payment.
- Technical: client-held cart + stateless quote/place services (03-research
  D1); schedule config in src/lib until feat-007 (D3); order status +
  payment enums defined once (D6); useSyncExternalStore for browser-storage
  state (09-debug.md).

## Files Modified This Session

- harness/specs/002-cos-comanda/* (full chain 01–09), feature-list.json
- src/server/db/schema.ts + migrations 0001–0003, scripts/seed.ts,
  data/delivery-zones.json
- src/lib/{restaurant-config,schedule,order-schemas,cart,quote-types}.ts
- src/server/repositories/{menu,zones,orders}.ts, src/server/services/{pricing,orders}.ts
- src/app/api/{zones,cart/quote,orders}/route.ts
- src/components/cart/*, src/components/menu/ProductCard.tsx, src/app/layout.tsx
- src/app/{cos,comanda,comanda/confirmare,termeni,confidentialitate}/page.tsx
- tests/{menu,orders,schedule}.test.ts

## Notes for the Next Session

This project uses the long-track harness. Read AGENTS.md first, always.
Docker Desktop must be running before ./init.sh (it starts the db container).
Integration tests self-migrate and self-seed (they need the Docker db up).
Topping names are unique only within their group — always scope lookups by
(group, name) (09-debug.md). The boundary check greps for the server-import
string even in comments — don't write it literally in src/components files.
