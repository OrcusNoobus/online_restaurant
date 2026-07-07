# PROGRESS.md

> Authored by: Agent (updated before every session ends; human may correct).
> This file answers one question for the next session: "Where are we, and what is next?"
> It is a snapshot, not a history — overwrite sections freely. DEV_LOG.md and git log are the history.

## Current State

- **Last updated:** 2026-07-07 (feat-011 DONE — full chain spec→quickstart
  in one session; evidence in harness/feature-list.json. Same session:
  feat-010 merged to main and pushed after stripping co-author trailers —
  owner request, standing rule: NO Co-Authored-By trailers in this repo.)
- **Active feature:** none in progress. feat-011 (Cupoane) is done on
  branch `feat/011-cupoane` (worktree strange-hopper-b16056), which sits
  directly on top of main (@ 83f77b6 = origin/main) — a clean fast-forward
  away. Owner picked ALL remaining features (2026-07-06): next are
  feat-009 (WhatsApp/Telegram) and feat-012 (plată online), BOTH gated on
  owner inputs (see Next Steps).
- **Verification status:** ./init.sh fully green 2026-07-07: 226 tests +
  1 skip (assistant live smoke — key revoked by owner, skips by design),
  lint, typecheck, boundary checks, build incl. /admin/cupoane +
  /api/admin/coupons*. `npm test -- tests/coupons`: 28/28.
- **API keys:** ANTHROPIC_API_KEY still revoked/commented out in the
  git-ignored .env (shop unaffected; ChatFab hidden; smoke skips).
  GOOGLE_CLIENT_ID/SECRET still not created (owner) — accounts fully
  functional without them (D8).
- **Dev DB state:** clean — feat-011 quickstart data removed (order #1687,
  4 coupons, temp staff #172/#173) and `open_minutes` restored to 660.
  Dev staff `admin` (#45) / `angajat` (#48) exist (passwords not recorded —
  recreate via scripts/create-staff-user.ts if needed).

## Done

- [x] feat-001 Setup; feat-002 Meniu; feat-006 Coș și comandă
- [x] feat-007 Panou admin; feat-008 Asistent AI (remaining human check:
      hear the alert tone on the restaurant device)
- [x] feat-010 Conturi clienți — MERGED to main @ 83f77b6 (pushed);
      remaining owner check: real Google round-trip (005 quickstart Flow 6)
      once the Google Cloud OAuth client exists
- [x] feat-011 Cupoane de reducere (chain 01–09, T01–T08) on
      `feat/011-cupoane`:
  - coupons table (normalized unique code, coupon_type enum, per-type value
    CHECKs with IS NOT NULL guards — see 006 09-debug.md) + orders snapshot
    columns (coupon_id RESTRICT, coupon_code, discount_bani; total CHECKs
    extended with −discount, relaxed to ≥ 0)
  - discount computed INSIDE quoteCart (single money engine): floor
    percent / capped fixed / fee-equal free_delivery; 4 granular reason
    codes; injectable `now` end-to-end (placeOrder passes context.now)
  - admin: /api/admin/coupons* (requireAdmin, no delete) + /admin/cupoane
    page (ZonesTable pattern); angajat sees the discount on orders only
  - shop: coupon under its own localStorage key (old carts parse), applied
    chip + discount lines in /cos, /comanda («gratuită (cupon)» for
    free_delivery), confirmation, /cont order detail, admin panel
  - quickstart flows 1–7 executed 2026-07-07 at 375px live (order #1687
    end-to-end, cleaned up after)

## In Progress

- Nothing. Next session starts feat-009 or feat-012 at 01-spec (owner
  inputs pending — see below).

## Next Steps

1. **Owner (gating feat-012):** choose the card-payment provider
   (Stripe / Netopia / PayU / alt) and create a sandbox account. Agent then
   starts feat-012 at 01-spec.
2. **Owner (gating feat-009):** decide the first channel
   (Telegram — bot token, minutes to create; WhatsApp Business —
   verification, days/weeks) and provide a fresh ANTHROPIC_API_KEY (the
   assistant core is the engine behind feat-009; live testing needs it).
3. **Owner decision:** merge `feat/011-cupoane` → main (clean fast-forward
   from 83f77b6) and push, same as feat-010. Commits already have NO
   co-author trailers (standing rule).
4. **Owner, small (standing):** Google Cloud OAuth client + 005 quickstart
   Flow 6; fresh production ANTHROPIC_API_KEY at deploy time; hear the
   new-order tone on the restaurant device; lawyer-reviewed T&C/GDPR texts.

## Blockers / Risks

- feat-009 and feat-012 are both blocked on owner inputs (provider choice /
  tokens / API key) — nothing technical.
- Q3 recorded consequence (feat-011): a valid coupon has NO usage limits in
  v1 — same client can reuse it within the window; control = validity
  window + manual deactivation. Usage limits = deferred feature.
- Q5 accepted risk (feat-010) unchanged: unverified guest-order linking,
  disclosed on /confidentialitate.

## Decisions Made This Session

- Owner (2026-07-06): merge feat-010 with co-author trailers REMOVED —
  standing rule for all commits in this repo; feature history rewritten
  (content identical, SHAs remapped — see DEV_LOG).
- Owner (2026-07-06): do ALL three remaining features; feat-011 first
  (self-contained). Coupons interview Q1–Q4 + research D1–D6 approved in
  full (incl. D-d: free-delivery threshold compares the PRE-discount
  value).
- Implementation-level (feat-011, in 006 03-research + 09-debug): every
  coupon type manifests as `discountBani` (fee line stays intact;
  free_delivery renders «gratuită (cupon)»); CHECK constraints on nullable
  columns need explicit IS NOT NULL; `caffeinate -is` for unattended test
  runs on this Mac.

## Files Modified This Session

- feat-011 full chain: harness/specs/006-cupoane/* (01–09), schema.ts +
  migration 0007, repositories/coupons.ts, services/{pricing,orders,
  admin-coupons}.ts, repositories/orders.ts, api/admin/coupons*,
  api/cart/quote, lib/{order-schemas,admin-schemas,quote-types}.ts,
  components/cart/{cart-store,useQuote}.ts, cos/comanda/confirmare/cont
  pages, components/admin/{CouponsTable,OrderDetailPanel,types},
  admin layout + /admin/cupoane, services/assistant.ts (mechanical
  projection), tests/{coupons,coupons-routes,orders,assistant}.test.ts
- harness/feature-list.json (feat-011 → done + evidence; feat-010 SHA
  remap), harness/PROGRESS.md, SESSION-HANDOFF.md, DEV_LOG.md

## Notes for the Next Session

This project uses the long-track harness. Read AGENTS.md first, always.
Docker Desktop must be running before ./init.sh. In THIS worktree, .env
needs COMPOSE_PROJECT_NAME=magazin_online or docker compose conflicts on
the royal-db container name.
Integration tests self-migrate and self-seed; suites clean up after
themselves; vitest files run SEQUENTIALLY (shared dev DB).
For unattended full-suite runs on this Mac use `caffeinate -is npm test` —
the machine sleeping mid-run produces 15-minute phantom test failures.
The boundary check greps the server-import string even in comments in
src/components — do not write it literally there.
Topping names are unique only within their group — scope lookups by
(group, name).
NO Co-Authored-By trailers in commits (owner rule, 2026-07-06).
