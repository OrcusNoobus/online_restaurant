# PROGRESS.md

> Authored by: Agent (updated before every session ends; human may correct).
> This file answers one question for the next session: "Where are we, and what is next?"
> It is a snapshot, not a history — overwrite sections freely. DEV_LOG.md and git log are the history.

## Current State

- **Last updated:** 2026-07-04 (feat-006 merged to main and pushed)
- **Active feature:** none — feat-006 (Coș și plasare comandă) DONE, merged
  fast-forward into main @ cf3d2a6, pushed to GitHub; merged local branches
  deleted.
- **Verification status:** ./init.sh fully green ON MAIN after the merge
  (47/47 tests, build, boundary checks); quickstart flows 1–5 executed live
  (orders #13 delivery / #19 pickup in the dev DB).
- **Owner inputs received (2026-07-04):** restaurant address + phone
  (Str. Principală nr. 2, Sântana de Mureș · 0371 717 177) now in
  `src/lib/restaurant-config.ts`; T&C + GDPR pages carry owner-approved
  PRELIMINARY texts — replace with lawyer-reviewed versions before real
  marketing pushes.

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

1. feat-007 (Panou admin: produse și comenzi) — starts at spec time with the
   owner. Known seeds for its spec: staff auth, live order list + status
   transitions (enum already in DB: new → accepted → in_delivery →
   completed / canceled), dispatcher-adjustable delivery estimate (002
   clarify Q10 note), zone fee/threshold editing, product/topping
   activate-deactivate (soft hide already respected by menu + pricing).
2. Alternative next: feat-010/011/012 exist in the list but depend on or are
   smaller than feat-007; feat-007 unlocks going live (orders only in DB).
3. Later: replace the preliminary legal texts with lawyer-reviewed versions.

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
