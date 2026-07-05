# PROGRESS.md

> Authored by: Agent (updated before every session ends; human may correct).
> This file answers one question for the next session: "Where are we, and what is next?"
> It is a snapshot, not a history — overwrite sections freely. DEV_LOG.md and git log are the history.

## Current State

- **Last updated:** 2026-07-05 (feat-007 DONE on its branch)
- **Active feature:** none — feat-007 (Panou admin) DONE with evidence on
  branch `feat/007-panou-admin` @ 19c6d45 (16 commits, T01–T15 + doc chain
  01–09 complete). NOT yet merged into main — merge + push is the human's
  call (main is still at the feat-006 merge, green).
- **Verification status:** on the branch: ./init.sh fully green (build,
  112/112 tests, lint, boundary checks); feature verification
  `npm test -- tests/admin` 46/46; 08-quickstart.md flows 1–9 executed live
  in the browser 2026-07-05 (desktop + 375px).
- **Dev DB state:** catalog/zones force-reseeded clean; protection flags
  NULL; dev accounts `admin` (#45, admin) and `angajat` (#48, staff) exist
  (passwords not recorded — recreate via scripts/create-staff-user.ts if
  needed); test orders #275/#276 completed, #325 accepted, plus older ones —
  harmless history for the day views.

## Done

- [x] feat-001 Project setup; feat-002 Meniu produse; feat-006 Coș și
  plasare comandă (merged to main @ cf3d2a6)
- [x] feat-007 Panou admin — full chain 01–09 + T01–T15 on feat/007-panou-admin:
  - staff auth: scrypt + DB sessions, rolling 7d, proxy presence check +
    real verify in layout, login rate limit, create-staff-user CLI
  - order lifecycle: pure status graph, journal table with undo, conditional
    UPDATE → 409 stale_state, day view + totals, 5s polling UI with Web
    Audio alert (visible on/off/blocked state), detail panel, cancel dialog
    (mandatory reason), estimate-at-accept
  - catalog admin: full read (inactive incl.), availability toggles (staff),
    prices/texts/create category+product (admin), server-side slugs,
    ingredients/allergens now shown in the shop options sheet
  - zones + settings admin pages; schedule/estimates live from the DB
    settings row (checkout reads GET /api/schedule)
  - seed-ownership guard: first panel write stamps the domain flag, seed
    skips that section loudly, SEED_FORCE=1 resets

## In Progress

- (nothing mid-flight)

## Next Steps

1. **Human decision:** merge `feat/007-panou-admin` into main (fast-forward)
   and push — after that the shop is functionally ready to take real orders
   (orders were the go-live blocker, clarify Q6).
2. **Human check (one item):** hear the actual new-order tone on the
   restaurant device with speakers (visible sound state + unlock-on-click
   verified in browser; tone is Web Audio, no asset).
3. Small spun-off cleanup (chip exists): hide the shop's floating cart
   button on /admin routes — it renders from the root layout there.
4. Next feature candidates: feat-008 (Asistent AI chat, depends 006),
   feat-010/011/012 per owner priority. Also still pending long-term:
   lawyer-reviewed T&C/GDPR texts.

## Blockers / Risks

- None technical. Go-live still needs: feature merged, staff accounts
  created on the real host, owner walk-through of the panel.

## Decisions Made This Session

- (implementation-level only; no new product decisions — D1–D10 from
  03-research were executed as approved on 2026-07-05)

## Files Modified This Session

- scripts/seed.ts (ownership guard), src/server/repositories/settings.ts
  (protection flags), src/server/services/admin-catalog.ts (flag stamping)
- src/app/admin/(panel)/{page,produse/page,zone/page,setari/page}.tsx
- src/components/admin/* (12 files: orders day view + detail, catalog tree,
  price cells, toggles, forms, types, formatting)
- src/components/cart/OptionsSheet.tsx (ingredients/allergens block)
- tests/admin.test.ts (+seed-guard integration tests → 46)
- harness/specs/003-panou-admin/{07-tasks,08-quickstart,09-debug}.md,
  harness/feature-list.json (evidence)

## Notes for the Next Session

This project uses the long-track harness. Read AGENTS.md first, always.
Docker Desktop must be running before ./init.sh (it starts the db container).
Integration tests self-migrate and self-seed; the admin suite runs the REAL
seed via execSync and resets the protection flags in cleanup.
After manual panel testing on dev: clean up created test entities, then
`SEED_FORCE=1 npm run db:seed` (see 003 09-debug.md).
React 19 lint patterns for admin UI (set-state-in-effect, key remounts,
AudioContext narrowing) are documented in 003-panou-admin/09-debug.md.
Topping names are unique only within their group — scope lookups by
(group, name). The boundary check greps the server-import string even in
comments in src/components — do not write it literally there.
