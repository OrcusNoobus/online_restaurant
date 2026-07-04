# PROGRESS.md

> Authored by: Agent (updated before every session ends; human may correct).
> This file answers one question for the next session: "Where are we, and what is next?"
> It is a snapshot, not a history — overwrite sections freely. DEV_LOG.md and git log are the history.

## Current State

- **Last updated:** 2026-07-04 (feat-002 session 2, clock-out + list cleanup)
- **Active feature:** none — feat-001 and feat-002 done; feat-006 (Coș și
  plasare comandă) is next and starts at spec time with the owner
- **Note:** the template's pseudo-features (verification coverage / docs /
  cleanup, formerly feat-003..005) were removed from feature-list.json — that
  work is the Definition of Done in AGENTS.md, applied per feature, not a
  feature itself. The work they tracked WAS done (commits 62b5fe0, 48ccd43,
  f43f7c8). IDs were not renumbered; feat-006..009 keep their names.
- **Latest commit:** see git log on feat/002-meniu-catalog (T02–T07 complete)
- **Verification status:** ./init.sh green; `npm test -- tests/menu` 6/6; all
  08-quickstart.md flows executed and passing

## Done

- [x] Harness scaffold + feat-001 Project setup (Next.js 16, Postgres 17, Vitest)
- [x] Clarify Q1–Q7 answered by owner; data model final (ToppingPrice per size)
- [x] feat-002 Meniu produse — complete:
  - T01 legacy menu snapshot `data/menu-seed.json` (13 cat / 73 prod / 117 var)
  - T02 Drizzle: 7 tables, price CHECKs, migrations in ./init.sh (SKIP_DB aware)
  - T03 idempotent `npm run db:seed` (zod-validated, upsert by slug)
  - T04 `getMenu()` repository + 5 integration tests
  - T05 `GET /api/menu` + contract test
  - T06 mobile-first menu page (force-dynamic, CategoryNav, ProductCard)
  - T07 quickstart flows 1–4 executed on 375px viewport; evidence recorded

## In Progress

- (nothing mid-flight)

## Next Steps

1. Merge `feat/002-meniu-catalog` → `main` (owner's call; branch is green and
   self-contained).
2. feat-006 Coș și plasare comandă — start the document chain: draft
   `harness/specs/002-cos-comanda/01-spec.md` with the owner, collect clarify
   questions (SGR display, delivery zones/fees, minimum order, packaging rule
   from 02-clarify.md notes). Ordering is a service, callable by any channel
   (DECISIONS.md 2026-07-04).
3. Before feat-006 code: revisit the seed's replace-variants rule (variant ids
   must become stable once orders reference them — noted in scripts/seed.ts).

## Blockers / Risks

- None. Owner may want to eyeball the menu page (npm run dev) and replay
  08-quickstart.md before accepting feat-002 — flows already pass agent-side.

## Decisions Made This Session

- Menu page and /api/menu render force-dynamic (no build-time freeze of menu
  data); build output confirms ƒ Dynamic for both.
- Seed sets `active` only on insert — re-seeding never reactivates admin-hidden
  rows; variants are replaced per product (no natural key) until orders
  reference them (feat-006).
- Variant-level descriptions from the legacy site stay in the JSON snapshot
  only (see 02-clarify.md note) — data model keeps description on Product.

## Files Modified This Session

- drizzle.config.ts, src/server/db/* (schema, client, migrations)
- scripts/seed.ts, package.json (db:migrate, db:seed, deps), init.sh (migrate step)
- src/server/repositories/menu.ts, src/app/api/menu/route.ts
- src/app/page.tsx, src/app/layout.tsx, src/components/menu/*
- tests/menu.test.ts, vitest.config.ts (.env loading)
- harness state files + .claude/launch.json (preview tooling)

## Notes for the Next Session

This project uses the long-track harness. Read AGENTS.md first, always.
Docker Desktop must be running before ./init.sh (it starts the db container).
Integration tests self-migrate and self-seed (they need the Docker db up).
